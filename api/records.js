import { userToken, appToken, lark, cellToString, handle } from './_lark.js';
import { listFields } from './fields.js';

export default handle(async (req, res) => {
  const t = await userToken(req, res); if (!t) return;
  const table = new URL(req.url, 'http://x').searchParams.get('table');
  if (!/^tbl\w+$/.test(table || '')) return res.status(400).send('bad table');
  const app = await appToken(t);
  const types = Object.fromEntries((await listFields(t, app, table)).map(f => [f.field_name, f.type]));
  const out = []; let pt = '';
  do {
    const d = await lark(t, `/bitable/v1/apps/${app}/tables/${table}/records/search?page_size=500${pt ? `&page_token=${pt}` : ''}`, { method: 'POST', body: '{}' });
    for (const it of d.items || []) {
      const fields = {};
      for (const [name, v] of Object.entries(it.fields || {})) fields[name] = cellToString(v, types[name]);
      out.push({ id: it.record_id, fields });
    }
    pt = d.has_more ? d.page_token : '';
  } while (pt);
  res.setHeader('Cache-Control', 'no-store');
  res.json(out);
});
