import { defineHappyPathHttpMocks } from '@craft-ts/style-testing';

/** Local Vite development runtime fixture: keep CSS injection, disable hot reload transport. */
const viteClient = `
export function createHotContext() { return { data: {}, accept(){}, acceptExports(){}, dispose(){}, prune(){}, decline(){}, invalidate(){}, on(){}, off(){}, send(){} }; }
const sheets = new Map();
export function updateStyle(id, content) { let style = sheets.get(id); if (!style) { style = document.createElement('style'); document.head.append(style); sheets.set(id, style); } style.textContent = content; }
export function removeStyle(id) { sheets.get(id)?.remove(); sheets.delete(id); }
export function injectQuery(url, query) { return url + (url.includes('?') ? '&' : '?') + query; }
`;
export function createReviewAppMocks(
  queue: unknown,
  close: unknown,
  iteration: unknown,
  digest: unknown,
) {
  return defineHappyPathHttpMocks(
    'libs/review-attestation/attestation-app/src/review-app.mocks.ts',
    {
      'GET /@vite/client': {
        response: viteClient,
        contentType: 'text/javascript',
      },
      'GET /api/evidence/review-app-self-visual-image': {
        response: `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="640" viewBox="0 0 390 640"><rect width="390" height="640" fill="#f4f5f8"/><rect x="24" y="24" width="342" height="592" rx="16" fill="white"/><text x="48" y="72" font-family="Arial" font-size="24" fill="#202737">Mon profil</text><circle cx="195" cy="152" r="40" fill="#e1e5ff"/><text x="195" y="162" text-anchor="middle" font-family="Arial" font-size="26" fill="#454fc5">JD</text><text x="48" y="248" font-family="Arial" font-size="14" fill="#5b6477">Nom</text><text x="48" y="280" font-family="Arial" font-size="20" fill="#202737">Jeanne Dupont</text><path d="M48 300H342" stroke="#e1e5ec"/><text x="48" y="344" font-family="Arial" font-size="14" fill="#5b6477">Équipe</text><text x="48" y="376" font-family="Arial" font-size="20" fill="#202737">Design produit</text><rect x="48" y="480" width="294" height="52" rx="8" fill="#edf8f1"/><text x="195" y="513" text-anchor="middle" font-family="Arial" font-size="16" fill="#237049">Profil enregistré</text></svg>`,
        contentType: 'image/svg+xml',
      },
      'GET /api/review': { response: queue },
      'POST /api/decisions': { response: queue },
      'POST /api/decisions/reopen': { response: queue },
      'POST /api/close-review': { response: close },
      'POST /api/iteration-handoff': { response: iteration },
      'POST /api/regenerate': { response: queue },
      'GET /api/digest/*': { response: digest },
    },
  );
}
