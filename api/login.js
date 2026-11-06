import crypto from 'node:crypto';
import { OPEN, origin, setCookie, handle } from './_lark.js';

export default handle(async (req, res) => {
  if (!process.env.LARK_APP_ID) return res.status(500).send('LARK_APP_ID is not set');
  const state = crypto.randomBytes(16).toString('hex');
  setCookie(res, 'ph_state', state, 600);
  const redirect = `${origin(req)}/api/callback`;
  const url = `${OPEN}/open-apis/authen/v1/authorize?app_id=${encodeURIComponent(process.env.LARK_APP_ID)}&redirect_uri=${encodeURIComponent(redirect)}&state=${state}`;
  res.writeHead(302, { Location: url }).end();
});
