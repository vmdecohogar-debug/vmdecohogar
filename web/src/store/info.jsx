// Páginas informativas: preguntas frecuentes, tiempos de respuesta y política de privacidad.
// Los textos llegan del servidor (server/src/content/info.js), que también los usa para el SEO.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStore, waLink } from './StoreContext.jsx';
import { useData } from './pages.jsx';
import { Ico, WhatsAppIcon } from './icons.jsx';
import './info.css';

// Título y descripción al navegar dentro de la tienda (en la primera carga ya los pone el servidor).
function usePageMeta(page) {
  const { config } = useStore();
  useEffect(() => {
    if (!page) return;
    document.title = `${page.title} | ${config?.store?.name ?? 'VM Bazar y Deco'}`;
    const tag = document.querySelector('meta[name="description"]');
    if (tag) tag.setAttribute('content', page.description);
  }, [page, config]);
}

function InfoPage({ pick, children }) {
  const { data, error } = useData('/store/info');
  const page = data?.[pick];
  usePageMeta(page);
  if (error) return <div className="s-wrap"><div className="notice error">{error}</div></div>;
  if (!page) return <div className="s-wrap s-loading" aria-busy="true">Cargando…</div>;
  return <section className="s-section s-wrap s-narrow s-info">{children(page)}</section>;
}

function AskUs() {
  const { config } = useStore();
  const wa = waLink(config?.store?.whatsapp, config?.store?.whatsappMessage);
  return (
    <div className="s-info-ask">
      <p>¿No encontraste lo que buscabas?</p>
      {wa
        ? <a className="s-btn" href={wa} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={18} /> Escribinos por WhatsApp</a>
        : <Link className="s-btn" to="/contacto">Escribinos</Link>}
    </div>
  );
}

export function Faq() {
  return (
    <InfoPage pick="faq">
      {(page) => (
        <>
          <h1 className="s-page-title">{page.title}</h1>
          <p className="s-info-intro">{page.intro}</p>
          {page.groups.map((g) => (
            <div key={g.title} className="s-faq-group">
              <h2>{g.title}</h2>
              {g.items.map((i) => (
                <details key={i.q} className="s-faq">
                  <summary>{i.q}</summary>
                  <p>{i.a}</p>
                </details>
              ))}
            </div>
          ))}
          <p className="s-info-links">
            También podés ver nuestros <Link to="/tiempos-de-respuesta">tiempos de respuesta</Link> y la <Link to="/privacidad">política de privacidad</Link>.
          </p>
          <AskUs />
        </>
      )}
    </InfoPage>
  );
}

export function ResponseTimes() {
  return (
    <InfoPage pick="compromiso">
      {(page) => (
        <>
          <h1 className="s-page-title">{page.title}</h1>
          <p className="s-info-intro">{page.intro}</p>
          <ul className="s-times">
            {page.items.map((i) => (
              <li key={i.key}>
                <Ico name="clock" />
                <div>
                  <h2>{i.label}</h2>
                  <strong className="s-times-value">{i.time}</strong>
                  <p>{i.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="s-info-intro">{page.closing}</p>
          <AskUs />
        </>
      )}
    </InfoPage>
  );
}

export function Privacy() {
  return (
    <InfoPage pick="privacidad">
      {(page) => (
        <>
          <h1 className="s-page-title">{page.title}</h1>
          <p className="s-info-updated">Última actualización: {page.updated}</p>
          {page.sections.map((sec) => (
            <div key={sec.h} className="s-legal">
              <h2>{sec.h}</h2>
              {sec.p.map((t) => <p key={t}>{t}</p>)}
            </div>
          ))}
        </>
      )}
    </InfoPage>
  );
}
