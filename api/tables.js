import { userToken, appToken, lark, handle } from './_lark.js';

export default handle(async (req, res) => {
  const t = await userToken(req, res); if (!t) return;
  const app = await appToken(t);
  const out = []; let pt = '';
  do {
    const d = await lark(t, `/bitable/v1/apps/${app}/tables?page_size=100${pt ? `&page_token=${pt}` : ''}`);
    out.push(...(d.items || []).map(x => ({ id: x.table_id, name: x.name })));
    pt = d.has_more ? d.page_token : '';
  } while (pt);
  res.setHeader('Cache-Control', 'no-store');
  res.json(out);
});
