// Notion: official API (NOTION_TOKEN) → normalized tasks.
// Same shape as snapshots/notion-tasks.json, so build.mjs does not care where tasks came from.

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

const plain = (rich) => (rich || []).map((r) => r.plain_text || '').join('');

function readProp(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case 'title':
      return plain(prop.title);
    case 'rich_text':
      return plain(prop.rich_text);
    case 'select':
      return prop.select?.name || null;
    case 'status':
      return prop.status?.name || null;
    case 'multi_select':
      return (prop.multi_select || []).map((o) => o.name);
    case 'people':
      return (prop.people || []).map((p) => p.name || p.person?.email || p.id);
    case 'date':
      return prop.date?.start || null;
    case 'url':
      return prop.url || null;
    default:
      return null;
  }
}

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export async function fetchNotionTasks({ token, databaseId, properties }) {
  const tasks = [];
  let cursor;
  do {
    const res = await fetch(`${API}/databases/${databaseId}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
    });
    if (!res.ok) throw new Error(`Notion ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const page = await res.json();
    for (const p of page.results) {
      const P = (key) => readProp(p.properties[properties[key]]);
      const direction = P('direction');
      tasks.push({
        id: p.id,
        url: p.url,
        name: P('name') || '',
        status: P('status') || null,
        assignees: asList(P('assignees')),
        customers: asList(P('customers')),
        apps: asList(P('apps')),
        types: asList(P('types')),
        sources: asList(P('sources')),
        resolutions: asList(P('resolutions')),
        priority: asList(P('priority'))[0] || null,
        deadline: P('deadline'),
        deliverables: P('deliverables'),
        direction: Array.isArray(direction) ? direction[0] || null : direction,
        createdAt: p.created_time,
        editedAt: p.last_edited_time,
      });
    }
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return tasks;
}
