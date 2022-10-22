# VUT-kolej-finder

Simple tool to lookup anyone who is accommodated in VUT dormitories.
It is possible to construct a custom filter to make the lookup as specific as possible (lookup by block type and floor number).
Possible to lookup by name, surname and login (case and diacritics insensitive), dumping selected data to a text, CSV or JSON file.


```sh
Usage: node index.js [options] [filter]

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
    node index.js -f "Smith" -b B02 --floor 3                 Single person from B02 on the 3rd floor named "Smith"
    node index.js -f "someone" -r 418                         Single person from room 418 named "someone"
    node index.js -f "Tomas" -m                               All the people named "Tomas" from all blocks and rooms
    node index.js --dump --block-type A                       Dump all the people from all A blocks
    node index.js --dump -o database.json                     Dump all the people to database.json
    node index.js -i database.json -f "name" -o output.csv    Find a person named "name" in database.json and output to output.csv
```

Warning: This tool is not affiliated with VUT Brno in any way. Use at your own risk.
(The code needs some heavy refactoring, but it's enough to do the work.)