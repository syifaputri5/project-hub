import { exchangeCode, saveSession, readCookie, setCookie, handle } from './_lark.js';

export default handle(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  if (!code) return res.status(400).send('Missing code from Lark');
  if (!state || state !== readCookie(req, 'ph_state')) return res.status(400).send('Login expired, please try again');
  setCookie(res, 'ph_state', '', 0);
  saveSession(res, await exchangeCode(code));
  res.writeHead(302, { Location: '/' }).end();
});
