import * as colors from 'jsr:@std/fmt/colors';
import * as Diff from 'diff';
import { expandGlob } from "jsr:@std/fs/expand-glob";

export function diffWithColors(expected: string, actual: string) {
    const difference = Diff.diffChars(expected, actual);
    let coloredExpected = '';
    let coloredActual = '';
    for (const part of difference) {
        if (part.added) {
            coloredActual += colors.bgRed(part.value);
        } else if (part.removed) {
            coloredExpected += colors.bgRed(part.value);
        } else {
            coloredActual += part.value;
            coloredExpected += part.value;
        }
    }
    return [coloredExpected, coloredActual];
}

/**
 * Expand globs/wildcards in file arguments.
 *
 * This is for Windows, where the command line does not support metacharacters
 * such as * and ?, and it is expected that every program expands the arguments
 * itself. Note that the function reproduces the Unix behaviour: if a glob does
 * not match anything, the argument gets passed as-is.
 *
 * @param args The list of arguments to expand.
 * @returns The list of expanded arguments.
 */
export async function expandFileArguments(args: string[]) {
    const expanded: string[] = [];
    for (const arg of args) {
        const matches = await Array.fromAsync(expandGlob(arg));
        if (matches.length) {
            expanded.push(...matches.map((f) => f.path));
        } else {
            expanded.push(arg);
        }
    }
    return expanded;
}
