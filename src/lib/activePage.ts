import { writable } from 'svelte/store';

const pagesKeys = <const>[
    "home",
];

export const pages: string[] = pagesKeys.map(page => page.toString());

export type ActivePage = typeof pagesKeys[number];

export const defaultPage: ActivePage = "home";

export const activePage = writable<ActivePage>();

export function isPage(keyInput: string): keyInput is ActivePage {
    return pages.includes(keyInput);
}
