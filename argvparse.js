function isNumber(str) {
	return /^(?:^|[^a-zA-Z0-9_$])(?:\+|-)?((?:0(?:[xX][0-9a-fA-F]+|[oO][0-7]+|[bB][0-1]+)|(?:\d+\.|\.)?\d+)(?:e(?:\+|-)?\d+)?)$/i.test(str);
}

function isBool(str) {
	return /^(true|false)$/im.test(str);
}

function parseValue(str) {
	str = str.trim();

	if(isNumber(str)) return +str;
	else if(isBool(str)) return str == "true";
	else if(str === "") return true;
	else return str;
}

function parseArguments(argv = process.argv.slice(2)) {
	if(argv instanceof Array) {
		argv = argv.map(arg => {
			if(arg.indexOf(" ") == -1) return arg;
			if(arg.startsWith("-")) {
				const separator = arg.search(/=| +/) + 1;
				return arg.substring(0, separator) + '"' + arg.substring(separator).replace(/"/g, '\\"') + '"';
			}
			return '"' + arg.replace(/"/g, '\\"') + '"';
		}).join(" ");
	} else if(typeof argv !== "string") {
		throw new Error("Invalid input arguments! Expected string or array, got " + typeof argv);
	}

	const matches = argv.matchAll(/(?:-(?<isFlagName>-?)(?<flag>[^\s=]+)(?:=| *)(?!-)(["'`]?)(?<value>(?:\\\3|.)*?)\3(?:$| )|(["'`]?)(?<keyword>(?:\\\5|.)+?)\5(?:$| ))/gmi);
	const obj = {_: []};

	for(const {groups} of matches) {
		const {flag, value, keyword, isFlagName} = groups;

		if(keyword) {
			obj._.push(keyword);
			continue;
		} else if(!flag) {
			throw new Error("Failed to parse input arguments (invalid flag): " + argv);
		} else if(!isFlagName) {
			for(const [i, f] of flag.split("").entries()) {
				obj[f] = !i ? parseValue(value) : true;
			}
		} else if(isFlagName) {
			obj[flag] = parseValue(value);
		}
	}

	return obj;
}

module.exports = parseArguments;