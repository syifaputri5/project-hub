import { userToken, appToken, lark, handle } from './_lark.js';

export async function listFields(t, app, table) {
  const out = []; let pt = '';
  do {
    const d = await lark(t, `/bitable/v1/apps/${app}/tables/${table}/fields?page_size=100${pt ? `&page_token=${pt}` : ''}`);
    out.push(...(d.items || []));
    pt = d.has_more ? d.page_token : '';
  } while (pt);
  return out;
}

export default handle(async (req, res) => {
  const t = await userToken(req, res); if (!t) return;
  const table = new URL(req.url, 'http://x').searchParams.get('table');
  if (!/^tbl\w+$/.test(table || '')) return res.status(400).send('bad table');
  const app = await appToken(t);
  const fields = await listFields(t, app, table);
  res.setHeader('Cache-Control', 'no-store');
  // Records come back keyed by field name, so the name doubles as the id here.
  res.json(fields.map(f => ({ id: f.field_name, name: f.field_name })));
});
