import * as colors from 'jsr:@std/fmt/colors';
import * as Diff from 'diff';

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
