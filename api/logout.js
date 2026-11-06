import { setCookie, handle } from './_lark.js';

export default handle(async (req, res) => {
  setCookie(res, 'ph_session', '', 0);
  res.writeHead(302, { Location: '/' }).end();
});
