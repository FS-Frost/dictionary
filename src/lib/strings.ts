export function cleanWord(subword: string): string {
    const re = /(\w+)/;
    const result = re.exec(subword);
    if (!result || result.length == 0) {
        return subword;
    }

    return result[0];
}
