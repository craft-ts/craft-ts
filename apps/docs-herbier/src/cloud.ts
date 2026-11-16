/**
 * CraftTS Cloud does not exist yet: the docs ask who would use it before it is built.
 * Three places point at the waitlist — a banner above every page, a card on the home
 * page, and the page itself — and they all read these constants.
 */

/** The page that presents the cloud and carries the waitlist form. */
export const CLOUD_PAGE = '/resources/cloud';

/**
 * Where the waitlist form posts: a Formspree form, `https://formspree.io/f/<form id>`.
 * Formspree answers JSON to a request that accepts it, and draws its own thank-you
 * page for a form posted without JavaScript. Empty, the form tells the reader the
 * waitlist is not open yet and sends nothing.
 */
export const CLOUD_WAITLIST_ENDPOINT = 'https://formspree.io/f/xrpqbojz';

/** Where a reader's "hide the banner" is remembered, across visits. */
export const CLOUD_BANNER_STORAGE_KEY = 'craft-ts:cloud-banner';
