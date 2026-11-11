import { registerToCsv, registerToJson, type Project } from '../../shared/index.ts';
import { useData } from '../lib/data.tsx';
import { dataUrl } from '../lib/loadData.ts';

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** CSV / JSON downloads for the current filtered list and for the full register. */
export function ExportButtons({ filtered, label = 'this list' }: { filtered?: Project[]; label?: string }) {
  const { projects, data } = useData();
  const csv = (ps: readonly Project[], name: string) =>
    download(`${name}-${stamp()}.csv`, registerToCsv(ps, { bom: true, allProjects: projects }), 'text/csv;charset=utf-8');
  const json = (ps: readonly Project[], name: string) =>
    download(`${name}-${stamp()}.json`, registerToJson(ps, data.register.updatedAt), 'application/json');
  return (
    <div className="no-print flex flex-wrap items-center gap-2 text-sm">
      {filtered && (
        <>
          <span className="text-ink-muted">Download {label}:</span>
          <button type="button" className="btn" onClick={() => csv(filtered, 'dubai-logistics-filtered')} disabled={!filtered.length}>
            CSV
          </button>
          <button type="button" className="btn" onClick={() => json(filtered, 'dubai-logistics-filtered')} disabled={!filtered.length}>
            JSON
          </button>
          <span className="mx-1 hidden text-line sm:inline" aria-hidden="true">
            |
          </span>
        </>
      )}
      <span className="text-ink-muted">Full register:</span>
      <button type="button" className="btn" onClick={() => csv(projects, 'dubai-logistics-register')}>
        CSV
      </button>
      <button type="button" className="btn" onClick={() => json(projects, 'dubai-logistics-register')}>
        JSON
      </button>
      <a href={dataUrl('register')} className="text-sm">
        Canonical register.json
      </a>
    </div>
  );
}
