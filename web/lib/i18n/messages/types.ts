/** Each entry is [Kazakh, Russian]. Placeholders look like {name}; Russian plurals are "one|few|many". */
export type MessageTable = Record<string, readonly [kk: string, ru: string]>;
