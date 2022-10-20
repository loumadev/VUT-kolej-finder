//@ts-check

const {default: fetch} = require("node-fetch");
const path = require("path");
const fs = require("fs");
const argvparse = require("./argvparse");


/**
 * @typedef {Object} Person
 * @param {number} number
 * @param {string} fullname
 * @param {string} block
 * @param {string} room
 * @param {string} login
 * @param {string} email
 */

/**
 * @typedef {Object} QueryFilter
 * @param {string} block
 * @param {number} room
 * @param {number} floor
 * @param {string} blockType
 * @param {number} blockNumber
 */


(function(args) {
    //Init some utility functions
    const range = (start, stop, step = 1) => Array.from({length: (stop - start) / step + 1}, (_, i) => start + (i * step));
    const log = (...msg) => (args.v || args.verbose) && console.warn(...msg);
    const timeout = delay => new Promise(resolve => setTimeout(resolve, delay));
    const normalizeName = (name) => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    //Init input variables
    const output = args.o || args.output || "stdout";
    const outputStream = output === "stdout" ? process.stdout : fs.createWriteStream(path.resolve(output));
    const input = args.i || args.input;
    const format = (args.format || (output.endsWith(".csv") ? "csv" : (output.endsWith(".json") ? "json" : "text"))).toLowerCase();
    const batchSize = args["batch-size"] || 10;
    const fetchDelay = args["fetch-delay"] || 300;
    let inputFile = null;

    //Init 
    /**
     * @param {string} query
     * @return {Promise<Person[]>}
     */
    function fetchQuery(query) {
        return new Promise((resolve, reject) => {
            fetch("https://kn.vutbr.cz/is2/index.html", {
                "headers": {"content-type": "application/x-www-form-urlencoded"},
                "body": `str=${query}`,
                "method": "POST"
            })
                .then(e => e.text())
                .then(html => {
                    const people = [...html.matchAll(/(\d+)\.<\/font>\s*(.*?)\s*<\/th[\s\S]*?Login:[\s\S]*?<td>\s*(\w+?)\s*<\/td[\s\S]*?Blok:[\s\S]*?td>\s*([A-D]\d+)\s*<\/[\s\S]*?E-mail:[\s\S]*?<td>\s*([\w\-.@]+?)\s*<\/td[\s\S]*?Pokoj:[\s\S]*?td>\s*(\d+)\s*<\/td/g)]
                        .map(e => ({
                            "number": +e[1],
                            "fullname": e[2],
                            "block": e[4],
                            "room": e[6],
                            "login": e[3],
                            "email": e[5]
                        }));

                    resolve(people);
                }).catch(err => {
                    reject({error: err, query: query});
                });
        });
    }

    /**
     * @param {QueryFilter} filter
     * @return {string[] | Error} 
     */
    function compileFilter(filter) {
        const blockMap = {
            "a": [2, 3, 4, 5],
            "b": [2, 4, 5, 7],
            "c": [1, 2, 3],
            "d": [1, 2]
        };

        //Detect invalid values
        if(!filter) return new Error("Invalid filter argument.");
        if(filter.blockType) {
            if(!blockMap[filter.blockType]) return new Error("Unknown block type.");
            if(filter.blockNumber && !blockMap[filter.blockType].includes(filter.blockNumber)) return new Error("Specified block type and block number does not exists.");
        }
        if(filter.blockNumber && !Object.values(blockMap).flat().includes(filter.blockNumber)) return new Error("Specified block number does not exists in any block type.");
        if(filter.floor && (filter.floor < 1 || filter.floor > 9)) return new Error("Invalid floor number.");

        //Compute block type and compute bock number
        let results = [];
        if(filter.block) results.push(`${filter.block.toUpperCase()}`);
        else if(filter.blockType && filter.blockNumber) results.push(`${filter.blockType.toUpperCase()}${filter.blockNumber.toString().padStart(2, "0")}`);
        else if(filter.blockType) {
            results.push(...blockMap[filter.blockType].map(n => `${filter.blockType.toUpperCase()}${n.toString().padStart(2, "0")}`));
        } else if(filter.blockNumber) {
            results.push(...Object.entries(blockMap)
                .filter(([t, arr]) => arr.includes(filter.blockNumber))
                .map(([t, arr]) => `${t.toUpperCase()}${filter.blockNumber.toString().padStart(2, "0")}`)
            );
        } else {
            results.push(...Object.entries(blockMap).map(([t, arr]) => arr.map(n => `${t.toUpperCase()}${n.toString().padStart(2, "0")}`)).flat());
        }

        //Compute room and floor number
        if(filter.room) results = results.map(e => `${e}-${filter.room.toString().padStart(3, "0")}`);
        else if(filter.floor) {
            results = results.map(e => range(1, 50).map(n => `${e}-${(filter.floor * 100 + n).toString().padStart(3, "0")}`)).flat();
        } else {
            results = results.map(e => range(2, 9).map(f => range(1, 50).map(r => `${e}-${(f * 100 + r).toString().padStart(3, "0")}`))).flat(2);
        }

        return results;
    }

    /**
     * @param {string[]} filter
     * @param {(function(Person): boolean)} callback
     * @return {Promise<void>} 
     */
    async function fetchFilterQueries(filter, callback) {
        //Use input file as a cache to prevent from spamming the server
        if(inputFile) {
            for(const query of filter) {
                const people = inputFile.filter(e => `${e.block}-${e.room}` === query);
                if(people.length > 0 && callback(people)) break;
            }

            return;
        }

        //Fetch data from server
        const MAX_TRIES = 3;
        const retries = {};
        const retry = [];

        let isStopped = false;

        for(let i = 0; i < filter.length; i += batchSize) {
            if(isStopped) break;

            const batch = filter.slice(i, i + batchSize);
            const batchResults = await Promise.allSettled(batch.map(e => fetchQuery(e)));

            for(const result of batchResults) {
                if(result.status === "rejected") {
                    const data = result.reason;
                    const query = data.query;

                    retries[query] = retries[query] ? retries[query] + 1 : 1;
                    if(retries[query] < MAX_TRIES) retry.push(query);
                } else if(callback(result.value)) {
                    isStopped = true;
                    break;
                }
            }

            log(`Failed ${batchResults.filter(e => e.status === "rejected").length} queries out of ${batch.length}, retrying ${retry.length} queries...`);

            if(!isStopped) await timeout(fetchDelay);
        }
    }

    /** @type {Person[]} */
    const __jsonCache = [];
    /**
     * @param {Person} person
     */
    function writeOutput(person) {
        if(person === null) {
            if(format === "json") outputStream.write(JSON.stringify(__jsonCache));
            if(outputStream !== process.stdout) outputStream.end();
        } else {
            if(format === "text") {
                outputStream.write(`${person.fullname} (${person.login})\n${person.email}\n${person.block} ${person.room}\n\n`);
            }

            if(format === "csv") {
                outputStream.write(`${person.fullname},${person.login},${person.email},${person.block},${person.room}\n`);
            }

            if(format === "json") {
                __jsonCache.push(person);
            }
        }
    }

    /**
     * @return {void} 
     */
    function printHelp() {
        const program = `node ${path.relative(process.cwd(), process.argv[1])}`;
        console.log(`Usage: ${program} [options] [filter]

Options:
    -h, --help                    Show this help message.
    -o, --output <file>|stdout    Target file to output the results to. Defaults to stdout.
    -i, --input <file>            Input dumped JSON data to use instead of fetching from the server.
    -f, --find <name>             Find a person by their name, surname or login. (case and diacritics insensitive)
    -m, --multiple                Allow multiple results (prevent returning after first match). (can only be used with -f)
    --dump                        Dump all the people matching the filter to the selected output. (cannot be used with -f)
    --format <format>             Format of the output. Defaults to "text" or autodetected from -o extension. Available formats: text, csv, json.
    --batch-size <size>           Number of rooms to fetch at once. Defaults to 10.
    --fetch-delay <delay>         Delay in ms between fetching batches. Defaults to 300.
    -v, --verbose                 Show more information about the process (to stderr).

Filter:
    -b, --block <block>           Filter by block. (e.g. A01)
    -r, --room <room>             Filter by room. (e.g. 218)
    --floor <floor>               Filter by floor. (e.g. 2) (ignored if -r is set)
    --block-type <type>           Filter by block type. (e.g. A) (ignored if -b is set)
    --block-number <number>       Filter by block number. (e.g. 1) (ignored if -b is set)

Block types:
    A - Koleje pod Palackého vrchem
    B - Purkyňovy koleje
    C - Listovy koleje
    D - Mánesovy koleje

Block numbers:
    A - 2, 3, 4, 5
    B - 2, 4, 5, 7
    C - 1, 2, 3
    D - 1, 2

Examples:
    ${program} -f "Smith" -b B02 --floor 3                 Single person from B02 on the 3rd floor named "Smith"
    ${program} -f "someone" -r 418                         Single person from room 418 named "someone"
    ${program} -f "Tomas" -m                               All the people named "Tomas" from all blocks and rooms
    ${program} --dump --block-type A                       Dump all the people from all A blocks
    ${program} --dump -o database.json                     Dump all the people to database.json
    ${program} -i database.json -f "name" -o output.csv    Find a person named "name" in database.json and output to output.csv
`);
        return process.exit(0);
    }

    (async function main() {
        //Resolve help option
        if(args.h || args.help) return printHelp();

        if(!["text", "csv", "json"].includes(format)) {
            console.error(`Unsupported format "${format}"`);
            return process.exit(1);
        }

        //Compile input filter to list of queries
        log("Trying to compile the input filter...");
        const filter = compileFilter({
            "block": args.b || args.block,
            "room": parseInt(args.r || args.room),
            "floor": parseInt(args.floor),
            "blockType": args["block-type"],
            "blockNumber": parseInt(args["block-number"])
        });

        if(filter instanceof Error) return console.error("Failed to compile the filter:", filter.message), process.exit(1);
        if(!filter.length) return console.error("Filter you specified is unable to generate any queries to fetch."), process.exit(1);
        log(`Filter compiled successfully with ${filter.length} results to fetch.`);
        log(filter);

        //Load and parse input file
        if(input) {
            log("Trying to load input file...");
            try {
                inputFile = JSON.parse(fs.readFileSync(input).toString());
            } catch(err) {
                console.error("Couldn't load or parse input file.");
                return process.exit(1);
            }
            log("Input file loaded successfully.");
        }

        //Find a person by name
        const nameToFind = args.f || args.find;
        const isDumping = args.dump;
        if(nameToFind) {
            if(isDumping) {
                console.error("Cannot use --dump with --find.");
                return process.exit(1);
            }

            if(typeof nameToFind !== "string") {
                console.error("Invalid name to find.");
                return process.exit(1);
            }

            const name = normalizeName(nameToFind);
            log(`Trying to find a person named "${name}"...`);

            await fetchFilterQueries(filter, data => {
                const people = data.filter(p => normalizeName(p.fullname).includes(name) || normalizeName(p.login).includes(name));
                log(`Fetched ${data.length} people, ${people.length} match the filter.`);

                if(people.length) {
                    if(args.m || args.multiple) {
                        people.forEach(p => writeOutput(p));
                        return false;
                    } else {
                        writeOutput(people[0]);
                        return true;
                    }
                }

                return false;
            });

            writeOutput(null);
            log("Finished fetching the queries.");
        }
        //Dump all people matching the filter
        else if(isDumping) {
            log("Dumping all the people matching the filter...");

            await fetchFilterQueries(filter, data => {
                log(`Fetched ${data.length} people.`);
                data.forEach(p => writeOutput(p));
                return false;
            });

            writeOutput(null);
            log("Finished fetching the queries.");
        }
        //No valid option, print help
        else {
            printHelp();
            process.exit(1);
        }
    })();

})(argvparse());