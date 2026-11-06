import { userToken, handle } from './_lark.js';

// Only signed-in users get the links to the base and the form.
export default handle(async (req, res) => {
  if (!(await userToken(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  res.json({ baseUrl: process.env.BASE_URL || '', formUrl: process.env.FORM_URL || '' });
});
