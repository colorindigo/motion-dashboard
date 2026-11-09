// Drive: asks the Apps Script web app (apps-script/Code.gs) to walk the deliverables folders.
// The script runs with the deploying user's access, so no Google Cloud project or API key is needed.

export async function fetchDriveRoots({ proxyUrl, ids, batch = 120 }) {
  const roots = {};
  for (let i = 0; i < ids.length; i += batch) {
    const chunk = ids.slice(i, i + batch);
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ ids: chunk }),
          redirect: 'follow',
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`Drive proxy ${res.status}: ${text.slice(0, 200)}`);
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error(`Drive proxy returned non-JSON (deployment access must be "Anyone"): ${text.slice(0, 160)}`);
        }
        if (json.error) throw new Error(`Drive proxy: ${json.error}`);
        Object.assign(roots, json.roots);
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    if (lastError) throw lastError;
    process.stdout.write(`  drive: ${Math.min(i + batch, ids.length)}/${ids.length} folders\n`);
  }
  return { roots };
}
