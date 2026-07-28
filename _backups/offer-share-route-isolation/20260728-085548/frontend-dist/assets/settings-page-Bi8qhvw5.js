import{a as e,i as t,n,s as r,t as i}from"./material-icon-B0rZhFsB.js";import{n as a}from"./environment-DiV6FEU6.js";import{a as o,c as s,i as c,l,n as u,o as d,s as f}from"./api-client-sz4u_m-f.js";import{n as p}from"./glass-panel-eZCtRy07.js";import{u as m}from"./index-BhfWebsS.js";import{a as h,d as g,i as _,o as v,t as y,u as b}from"./control-plane-ui-D-Ndfw6E.js";import{t as x}from"./use-tenant-administration-q4aZ5njg.js";import{r as S}from"./use-tracking-networks-lp-qYM9f.js";var C=r(e(),1),w=t(),T=/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u,E=[`all`,`pending_verification`,`active`,`suspended`,`archived`];function D(e){return e.split(`_`).map(e=>e.charAt(0).toUpperCase()+e.slice(1)).join(` `)}function O(e){if(e===null)return`Not verified`;let t=new Date(e);return Number.isNaN(t.getTime())?`Unknown`:new Intl.DateTimeFormat(void 0,{dateStyle:`medium`,timeStyle:`short`}).format(t)}function k({status:e}){return(0,w.jsx)(`span`,{className:`custom-domain-status custom-domain-status--${e}`,children:D(e)})}function A({domain:e,disabled:t,canManage:n,platformAdmin:r,onCopyToken:a,onSetPrimary:o,onStatus:s,onUpdateHostname:c}){let l=n&&e.status===`pending_verification`,u=n&&e.status===`active`&&e.verifiedAt!==null&&!e.isPrimary;async function d(t){t.preventDefault();let n=new FormData(t.currentTarget);await c(e,String(n.get(`hostname`)??``))}return(0,w.jsxs)(`article`,{className:`custom-domain-card`,children:[(0,w.jsxs)(`div`,{className:`custom-domain-card__heading`,children:[(0,w.jsx)(`span`,{className:`custom-domain-card__icon`,children:(0,w.jsx)(i,{name:`dns`})}),(0,w.jsxs)(`div`,{className:`custom-domain-card__identity`,children:[(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`strong`,{children:e.hostname}),e.isPrimary&&(0,w.jsxs)(`span`,{className:`custom-domain-primary`,children:[(0,w.jsx)(i,{filled:!0,name:`verified`}),`Primary`]})]}),(0,w.jsxs)(`small`,{children:[`Updated `,O(e.updatedAt)]})]}),(0,w.jsx)(k,{status:e.status})]}),(0,w.jsxs)(`div`,{className:`custom-domain-meta`,children:[(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{children:`Verification`}),(0,w.jsx)(`strong`,{children:e.verifiedAt===null?`DNS verification pending`:O(e.verifiedAt)})]}),(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{children:`Routing`}),(0,w.jsx)(`strong`,{children:e.isPrimary?`Primary traffic domain`:`Secondary domain`})]}),(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{children:`Created`}),(0,w.jsx)(`strong`,{children:O(e.createdAt)})]})]}),(0,w.jsxs)(`div`,{className:`custom-domain-token`,children:[(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{children:`Ownership verification token`}),(0,w.jsx)(`code`,{children:e.verificationToken})]}),(0,w.jsx)(`button`,{"aria-label":`Copy verification token`,disabled:t,onClick:()=>void a(e),title:`Copy verification token`,type:`button`,children:(0,w.jsx)(i,{name:`content_copy`})})]}),l&&(0,w.jsxs)(`form`,{className:`custom-domain-inline-form`,onSubmit:e=>void d(e),children:[(0,w.jsxs)(`label`,{children:[(0,w.jsx)(`span`,{children:`Pending hostname`}),(0,w.jsx)(`input`,{defaultValue:e.hostname,disabled:t,name:`hostname`,spellCheck:!1})]}),(0,w.jsxs)(`button`,{disabled:t,type:`submit`,children:[(0,w.jsx)(i,{name:`save`}),`Save hostname`]})]},`${e.id}:${e.hostname}`),(0,w.jsxs)(`div`,{className:`custom-domain-actions`,children:[u&&(0,w.jsxs)(`button`,{disabled:t,onClick:()=>void o(e),type:`button`,children:[(0,w.jsx)(i,{name:`star`}),`Make primary`]}),r&&e.status===`pending_verification`&&(0,w.jsxs)(`button`,{className:`is-primary`,disabled:t,onClick:()=>void s(e,`active`),type:`button`,children:[(0,w.jsx)(i,{name:`verified`}),`Verify and activate`]}),r&&e.status===`suspended`&&(0,w.jsxs)(`button`,{className:`is-primary`,disabled:t,onClick:()=>void s(e,`active`),type:`button`,children:[(0,w.jsx)(i,{name:`play_circle`}),`Reactivate`]}),n&&e.status===`active`&&(0,w.jsxs)(`button`,{className:`is-warning`,disabled:t,onClick:()=>void s(e,`suspended`),type:`button`,children:[(0,w.jsx)(i,{name:`pause_circle`}),`Suspend`]}),n&&e.status!==`archived`&&(0,w.jsxs)(`button`,{className:`is-danger`,disabled:t,onClick:()=>void s(e,`archived`),type:`button`,children:[(0,w.jsx)(i,{name:`archive`}),`Archive`]})]})]})}function j({embedded:e=!1}){let t=p(),n=S(),[r,a]=(0,C.useState)(``),[o,s]=(0,C.useState)(``),[c,l]=(0,C.useState)(`all`),[u,d]=(0,C.useState)(null),[f,m]=(0,C.useState)(null),h=(0,C.useMemo)(()=>{let e=o.trim().toLowerCase();return n.domains.filter(t=>{let n=e.length===0||t.hostname.toLowerCase().includes(e),r=c===`all`||t.status===c;return n&&r})},[o,c,n.domains]),g=n.domains.filter(e=>e.status===`active`).length,_=n.domains.filter(e=>e.status===`pending_verification`).length,v=n.domains.find(e=>e.isPrimary)??null;function y(){d(null),m(null)}async function b(e){e.preventDefault(),y();let t=r.trim().toLowerCase();if(!T.test(t)){m(`Enter a complete hostname such as track.example.com.`);return}try{await n.createDomain({hostname:t}),a(``),d(`${t} was added for DNS verification.`)}catch(e){m(e instanceof Error?e.message:`The tracking domain could not be created.`)}}async function x(e,t){y();let r=t.trim().toLowerCase();if(!T.test(r)){m(`Enter a complete hostname such as track.example.com.`);return}if(r===e.hostname){m(`The hostname has not changed.`);return}try{await n.updateDomain({domainId:e.id,hostname:r}),d(`Hostname changed to ${r}.`)}catch(e){m(e instanceof Error?e.message:`The hostname could not be updated.`)}}async function O(e){y();try{await n.updateDomain({domainId:e.id,isPrimary:!0}),d(`${e.hostname} is now the primary tracking domain.`)}catch(e){m(e instanceof Error?e.message:`The primary domain could not be changed.`)}}async function k(e,t){y();try{t===`active`||n.permissions.platformAdmin?await n.updatePlatformStatus({domainId:e.id,status:t}):await n.updateDomain({domainId:e.id,status:t}),d(`${e.hostname} is now ${D(t).toLowerCase()}.`)}catch(e){m(e instanceof Error?e.message:`The domain status could not be updated.`)}}async function j(e){y();try{await navigator.clipboard.writeText(e.verificationToken),d(`Verification token copied for ${e.hostname}.`)}catch{m(`The verification token could not be copied.`)}}return t.activeCompany===null?(0,w.jsxs)(`section`,{className:`custom-domain-state`,children:[(0,w.jsx)(i,{name:`domain_disabled`}),(0,w.jsx)(`h2`,{children:`Select an active company`}),(0,w.jsx)(`p`,{children:`Domain management requires an active company context.`})]}):n.status===`forbidden`?(0,w.jsxs)(`section`,{className:`custom-domain-state`,children:[(0,w.jsx)(i,{name:`lock`}),(0,w.jsx)(`h2`,{children:`Tracking domains are restricted`}),(0,w.jsx)(`p`,{children:`Your current role cannot access domain configuration.`})]}):n.status===`loading`||n.status===`idle`?(0,w.jsxs)(`section`,{className:`custom-domain-state`,children:[(0,w.jsx)(i,{className:`spin`,name:`progress_activity`}),(0,w.jsx)(`h2`,{children:`Loading tracking domains`}),(0,w.jsx)(`p`,{children:`Reading the latest domain configuration.`})]}):(0,w.jsxs)(`div`,{className:e?`custom-domain-panel is-embedded`:`custom-domain-panel is-page`,children:[(0,w.jsx)(`style`,{children:`
        .custom-domain-panel {
          --domain-text: #172033;
          --domain-muted: #69748a;
          --domain-accent: #6f5cf5;
          display: grid;
          gap: 18px;
          color: var(--domain-text);
        }
        .custom-domain-panel.is-page {
          padding: 4px;
        }
        .custom-domain-heading,
        .custom-domain-section,
        .custom-domain-state {
          border: 1px solid
            rgba(255, 255, 255, 0.86);
          border-radius: 24px;
          background:
            linear-gradient(
              145deg,
              rgba(255, 255, 255, 0.94),
              rgba(232, 238, 247, 0.84)
            );
          box-shadow:
            12px 12px 28px
              rgba(154, 165, 184, 0.22),
            -10px -10px 26px
              rgba(255, 255, 255, 0.88);
        }
        .custom-domain-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 24px;
        }
        .custom-domain-heading h1,
        .custom-domain-heading h2 {
          margin: 5px 0;
        }
        .custom-domain-heading p {
          margin: 0;
          color: var(--domain-muted);
        }
        .custom-domain-eyebrow {
          color: var(--domain-accent);
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .custom-domain-stats {
          display: grid;
          grid-template-columns:
            repeat(3, minmax(90px, 1fr));
          gap: 10px;
        }
        .custom-domain-stats div {
          display: grid;
          gap: 3px;
          padding: 12px 14px;
          border-radius: 16px;
          background: #eef3f8;
          box-shadow:
            inset 3px 3px 8px
              rgba(174, 185, 202, 0.24),
            inset -3px -3px 8px
              rgba(255, 255, 255, 0.9);
        }
        .custom-domain-stats span {
          color: var(--domain-muted);
          font-size: 0.7rem;
        }
        .custom-domain-stats strong {
          overflow-wrap: anywhere;
        }
        .custom-domain-feedback {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 13px 16px;
          border-radius: 15px;
          font-weight: 700;
        }
        .custom-domain-feedback.is-success {
          color: #166534;
          background: rgba(34, 197, 94, 0.11);
        }
        .custom-domain-feedback.is-error {
          color: #b42318;
          background: rgba(239, 68, 68, 0.1);
        }
        .custom-domain-layout {
          display: grid;
          grid-template-columns:
            minmax(240px, 0.7fr)
            minmax(0, 1.8fr);
          gap: 18px;
        }
        .custom-domain-section {
          padding: 22px;
        }
        .custom-domain-section-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 18px;
        }
        .custom-domain-section-heading h2 {
          margin: 4px 0;
          font-size: 1.16rem;
        }
        .custom-domain-section-heading p {
          margin: 0;
          color: var(--domain-muted);
          line-height: 1.55;
        }
        .custom-domain-section-heading
        > .material-symbols-outlined {
          color: var(--domain-accent);
          font-size: 28px;
        }
        .custom-domain-form {
          display: grid;
          gap: 14px;
        }
        .custom-domain-form label,
        .custom-domain-inline-form label {
          display: grid;
          gap: 7px;
          color: #4e586d;
          font-size: 0.78rem;
          font-weight: 700;
        }
        .custom-domain-form input,
        .custom-domain-inline-form input,
        .custom-domain-toolbar input,
        .custom-domain-toolbar select {
          width: 100%;
          min-height: 45px;
          padding: 10px 13px;
          border: 1px solid
            rgba(107, 118, 141, 0.12);
          border-radius: 14px;
          outline: none;
          color: var(--domain-text);
          background: #eef3f8;
          box-shadow:
            inset 4px 4px 9px
              rgba(174, 185, 202, 0.24),
            inset -4px -4px 9px
              rgba(255, 255, 255, 0.92);
        }
        .custom-domain-form button,
        .custom-domain-inline-form button,
        .custom-domain-actions button {
          display: inline-flex;
          min-height: 42px;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 0 15px;
          border: 0;
          border-radius: 13px;
          color: #5445c9;
          background: #edf2f8;
          box-shadow:
            6px 6px 14px
              rgba(163, 174, 193, 0.26),
            -6px -6px 14px
              rgba(255, 255, 255, 0.9);
          cursor: pointer;
          font-weight: 800;
        }
        .custom-domain-form button,
        .custom-domain-actions
        button.is-primary {
          color: white;
          background:
            linear-gradient(
              135deg,
              #7865f7,
              #5945dc
            );
        }
        .custom-domain-actions
        button.is-warning {
          color: #9a6700;
        }
        .custom-domain-actions
        button.is-danger {
          color: #b42318;
        }
        .custom-domain-form button:disabled,
        .custom-domain-inline-form
        button:disabled,
        .custom-domain-actions
        button:disabled {
          cursor: wait;
          opacity: 0.58;
        }
        .custom-domain-note {
          display: flex;
          gap: 8px;
          margin: 0;
          padding: 13px;
          border-radius: 14px;
          color: var(--domain-muted);
          background:
            rgba(111, 92, 245, 0.07);
          line-height: 1.5;
        }
        .custom-domain-toolbar {
          display: grid;
          grid-template-columns:
            minmax(0, 1fr) 180px 44px;
          gap: 10px;
          margin-bottom: 17px;
        }
        .custom-domain-refresh {
          display: grid;
          width: 44px;
          height: 44px;
          place-items: center;
          border: 0;
          border-radius: 13px;
          color: var(--domain-accent);
          background: #edf2f8;
          box-shadow:
            6px 6px 14px
              rgba(163, 174, 193, 0.24),
            -6px -6px 14px
              rgba(255, 255, 255, 0.9);
          cursor: pointer;
        }
        .custom-domain-list {
          display: grid;
          gap: 14px;
        }
        .custom-domain-card {
          display: grid;
          gap: 15px;
          padding: 18px;
          border: 1px solid
            rgba(255, 255, 255, 0.82);
          border-radius: 19px;
          background:
            rgba(255, 255, 255, 0.72);
          box-shadow:
            8px 8px 20px
              rgba(160, 171, 190, 0.2),
            -7px -7px 18px
              rgba(255, 255, 255, 0.84);
        }
        .custom-domain-card__heading {
          display: grid;
          grid-template-columns:
            auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
        }
        .custom-domain-card__icon {
          display: grid;
          width: 43px;
          height: 43px;
          place-items: center;
          border-radius: 13px;
          color: var(--domain-accent);
          background: #edf2f8;
          box-shadow:
            5px 5px 12px
              rgba(163, 174, 193, 0.24),
            -5px -5px 12px
              rgba(255, 255, 255, 0.9);
        }
        .custom-domain-card__identity {
          min-width: 0;
        }
        .custom-domain-card__identity
        > div {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }
        .custom-domain-card__identity strong {
          overflow-wrap: anywhere;
        }
        .custom-domain-card__identity small {
          display: block;
          margin-top: 3px;
          color: var(--domain-muted);
        }
        .custom-domain-primary,
        .custom-domain-status {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 9px;
          border-radius: 999px;
          font-size: 0.67rem;
          font-weight: 800;
        }
        .custom-domain-primary {
          color: #5b48da;
          background:
            rgba(111, 92, 245, 0.1);
        }
        .custom-domain-status--active {
          color: #166534;
          background:
            rgba(34, 197, 94, 0.12);
        }
        .custom-domain-status--pending_verification {
          color: #9a6700;
          background:
            rgba(245, 158, 11, 0.12);
        }
        .custom-domain-status--suspended {
          color: #b42318;
          background:
            rgba(239, 68, 68, 0.1);
        }
        .custom-domain-status--archived {
          color: #5d6472;
          background:
            rgba(100, 116, 139, 0.12);
        }
        .custom-domain-meta {
          display: grid;
          grid-template-columns:
            repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .custom-domain-meta div {
          display: grid;
          gap: 4px;
          padding: 11px 12px;
          border-radius: 13px;
          background: #eef3f8;
          box-shadow:
            inset 3px 3px 7px
              rgba(174, 185, 202, 0.21),
            inset -3px -3px 7px
              rgba(255, 255, 255, 0.88);
        }
        .custom-domain-meta span,
        .custom-domain-token span {
          color: var(--domain-muted);
          font-size: 0.68rem;
        }
        .custom-domain-meta strong {
          font-size: 0.78rem;
        }
        .custom-domain-token {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px;
          border-radius: 14px;
          background:
            rgba(111, 92, 245, 0.06);
        }
        .custom-domain-token div {
          display: grid;
          min-width: 0;
          gap: 5px;
        }
        .custom-domain-token code {
          overflow: hidden;
          color: #4d3fc0;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .custom-domain-token button {
          display: grid;
          width: 39px;
          height: 39px;
          flex: 0 0 auto;
          place-items: center;
          border: 0;
          border-radius: 12px;
          color: var(--domain-accent);
          background: #edf2f8;
          cursor: pointer;
        }
        .custom-domain-inline-form {
          display: grid;
          grid-template-columns:
            minmax(0, 1fr) auto;
          align-items: end;
          gap: 10px;
        }
        .custom-domain-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
        }
        .custom-domain-empty,
        .custom-domain-state {
          display: grid;
          min-height: 190px;
          place-items: center;
          align-content: center;
          gap: 8px;
          padding: 24px;
          text-align: center;
        }
        .custom-domain-empty {
          border-radius: 17px;
          color: var(--domain-muted);
          background:
            rgba(111, 92, 245, 0.05);
        }
        .custom-domain-empty
        > .material-symbols-outlined,
        .custom-domain-state
        > .material-symbols-outlined {
          color: var(--domain-accent);
          font-size: 34px;
        }
        .custom-domain-empty strong,
        .custom-domain-state h2 {
          margin: 0;
          color: var(--domain-text);
        }
        .custom-domain-empty span,
        .custom-domain-state p {
          margin: 0;
          color: var(--domain-muted);
        }
        @media (max-width: 1000px) {
          .custom-domain-heading {
            align-items: flex-start;
            flex-direction: column;
          }
          .custom-domain-layout {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 680px) {
          .custom-domain-stats,
          .custom-domain-meta {
            grid-template-columns: 1fr;
          }
          .custom-domain-toolbar {
            grid-template-columns: 1fr;
          }
          .custom-domain-refresh {
            width: 100%;
          }
          .custom-domain-card__heading {
            grid-template-columns:
              auto minmax(0, 1fr);
          }
          .custom-domain-card__heading
          > .custom-domain-status {
            grid-column: 1 / -1;
            width: fit-content;
          }
          .custom-domain-inline-form {
            grid-template-columns: 1fr;
          }
        }
      `}),(0,w.jsxs)(`section`,{className:`custom-domain-heading`,children:[(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{className:`custom-domain-eyebrow`,children:e?`Domain configuration`:`Tracking infrastructure`}),e?(0,w.jsx)(`h2`,{children:`Tracking domains`}):(0,w.jsx)(`h1`,{children:`Tracking domains`}),(0,w.jsxs)(`p`,{children:[`Configure verified redirect hostnames for`,` `,(0,w.jsx)(`strong`,{children:t.activeCompany.name}),`.`]})]}),(0,w.jsxs)(`div`,{className:`custom-domain-stats`,children:[(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{children:`Total`}),(0,w.jsx)(`strong`,{children:n.domains.length})]}),(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{children:`Active`}),(0,w.jsx)(`strong`,{children:g})]}),(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{children:`Primary`}),(0,w.jsx)(`strong`,{children:v?.hostname??`Not selected`})]})]})]}),(f??n.error??u)!==null&&(0,w.jsxs)(`div`,{className:f!==null||n.error!==null?`custom-domain-feedback is-error`:`custom-domain-feedback is-success`,role:f!==null||n.error!==null?`alert`:`status`,children:[(0,w.jsx)(i,{name:f!==null||n.error!==null?`error`:`check_circle`}),(0,w.jsx)(`span`,{children:f??n.error??u})]}),(0,w.jsxs)(`div`,{className:`custom-domain-layout`,children:[n.permissions.canManage&&(0,w.jsxs)(`section`,{className:`custom-domain-section`,children:[(0,w.jsxs)(`div`,{className:`custom-domain-section-heading`,children:[(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{className:`custom-domain-eyebrow`,children:`Domain setup`}),(0,w.jsx)(`h2`,{children:`Add tracking domain`}),(0,w.jsx)(`p`,{children:`Add the hostname that will receive tracking-link traffic.`})]}),(0,w.jsx)(i,{name:`domain_add`})]}),(0,w.jsxs)(`form`,{className:`custom-domain-form`,onSubmit:e=>void b(e),children:[(0,w.jsxs)(`label`,{children:[(0,w.jsx)(`span`,{children:`Tracking hostname`}),(0,w.jsx)(`input`,{disabled:n.isMutating,onChange:e=>a(e.target.value),placeholder:`track.example.com`,required:!0,spellCheck:!1,value:r})]}),(0,w.jsxs)(`p`,{className:`custom-domain-note`,children:[(0,w.jsx)(i,{name:`info`}),`Add the verification token shown after creation to your DNS provider. Platform Super Admin verification is required before activation.`]}),(0,w.jsxs)(`button`,{disabled:n.isMutating,type:`submit`,children:[(0,w.jsx)(i,{name:`add`}),n.isMutating?`Adding domain...`:`Add domain`]})]}),(0,w.jsxs)(`div`,{className:`custom-domain-stats`,style:{marginTop:`16px`},children:[(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{children:`Pending`}),(0,w.jsx)(`strong`,{children:_})]}),(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{children:`Active`}),(0,w.jsx)(`strong`,{children:g})]}),(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{children:`Mode`}),(0,w.jsx)(`strong`,{children:n.permissions.platformAdmin?`Platform`:`Company`})]})]})]}),(0,w.jsxs)(`section`,{className:`custom-domain-section`,children:[(0,w.jsx)(`div`,{className:`custom-domain-section-heading`,children:(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{className:`custom-domain-eyebrow`,children:`Domain directory`}),(0,w.jsx)(`h2`,{children:`Manage tracking domains`}),(0,w.jsxs)(`p`,{children:[h.length,` `,`domains match the current filters.`]})]})}),(0,w.jsxs)(`div`,{className:`custom-domain-toolbar`,children:[(0,w.jsx)(`input`,{"aria-label":`Search tracking domains`,onChange:e=>s(e.target.value),placeholder:`Search hostname`,value:o}),(0,w.jsx)(`select`,{"aria-label":`Filter domains by status`,onChange:e=>l(e.target.value),value:c,children:E.map(e=>(0,w.jsx)(`option`,{value:e,children:e===`all`?`All statuses`:D(e)},e))}),(0,w.jsx)(`button`,{"aria-label":`Refresh tracking domains`,className:`custom-domain-refresh`,disabled:n.isMutating,onClick:()=>void n.refresh(),title:`Refresh tracking domains`,type:`button`,children:(0,w.jsx)(i,{name:`refresh`})})]}),h.length===0?(0,w.jsxs)(`div`,{className:`custom-domain-empty`,children:[(0,w.jsx)(i,{name:`dns`}),(0,w.jsx)(`strong`,{children:`No matching tracking domains`}),(0,w.jsx)(`span`,{children:`Add a domain or change the current filters.`})]}):(0,w.jsx)(`div`,{className:`custom-domain-list`,children:h.map(e=>(0,w.jsx)(A,{canManage:n.permissions.canManage,disabled:n.isMutating,domain:e,onCopyToken:j,onSetPrimary:O,onStatus:k,onUpdateHostname:x,platformAdmin:n.permissions.platformAdmin},e.id))})]})]})]})}var M=[{id:`snapchat`,label:`Snapchat`,icon:`chat_bubble`},{id:`instagram`,label:`Instagram`,icon:`photo_camera`},{id:`facebook`,label:`Facebook`,icon:`public`}];function N(e){return Object.entries(e).map(([e,t])=>`${e}=${t}`).join(`
`)}function P(e){let t={},n=e.split(/\r?\n/u).map(e=>e.trim()).filter(e=>e.length>0);if(n.length>25)throw Error(`A maximum of 25 default query parameters is allowed.`);for(let e of n){let n=e.indexOf(`=`);if(n<=0)throw Error(`Invalid query parameter "${e}". Use key=value format.`);let r=e.slice(0,n).trim(),i=e.slice(n+1).trim();if(r.length===0)throw Error(`Each default query parameter requires a key.`);if(Object.hasOwn(t,r))throw Error(`The query parameter "${r}" is duplicated.`);t[r]=i}return t}function F(e,t,n){let r=new URL(`https://${e}/r/${t===`tracking_code`?`trk_7c9e2a4f`:`summer-campaign`}`);for(let[e,t]of Object.entries(n))r.searchParams.set(e,t);return r.toString()}function I(e){let t=new URL(e);return`${t.hostname.replaceAll(`.`,`[.]`)}${t.pathname}${t.search}`}function L(e,t,n){return n?e.includes(t)?e:[...e,t]:e.filter(e=>e!==t)}function R(){let e=m(),t=S(),[n,r]=(0,C.useState)(e.customization?.linkIdentifierMode??`slug_or_code`),[a,o]=(0,C.useState)(e.customization?.plainTextSharingEnabled??!0),[s,c]=(0,C.useState)(e.customization?.restrictedSharePlatforms??[`snapchat`,`instagram`,`facebook`]),[l,u]=(0,C.useState)(N(e.customization?.defaultLinkQueryParameters??{})),[d,f]=(0,C.useState)(null),[p,h]=(0,C.useState)(null);(0,C.useEffect)(()=>{let t=e.customization,n=window.setTimeout(()=>{r(t?.linkIdentifierMode??`slug_or_code`),o(t?.plainTextSharingEnabled??!0),c(t?.restrictedSharePlatforms??[`snapchat`,`instagram`,`facebook`]),u(N(t?.defaultLinkQueryParameters??{}))},0);return()=>{window.clearTimeout(n)}},[e.customization]);let g=(t.domains.find(e=>e.status===`active`&&e.isPrimary)??t.domains.find(e=>e.status===`active`)??null)?.hostname??`track.example.com`,_={},v=null;try{_=P(l)}catch(e){v=e instanceof Error?e.message:`The query parameters are invalid.`}let y=F(g,n,_),b=I(y);async function x(t){t.preventDefault(),f(null),h(null);try{let t=P(l);await e.updateCustomization({linkIdentifierMode:n,plainTextSharingEnabled:a,restrictedSharePlatforms:s,defaultLinkQueryParameters:t}),f(`Link configuration was saved.`)}catch(e){h(e instanceof Error?e.message:`Link configuration could not be saved.`)}}async function T(e,t){f(null),h(null);try{await navigator.clipboard.writeText(e),f(`${t} copied to the clipboard.`)}catch{h(`${t} could not be copied.`)}}return e.status===`loading`||e.status===`idle`?(0,w.jsxs)(`section`,{className:`link-customize-state`,children:[(0,w.jsx)(i,{className:`spin`,name:`progress_activity`}),(0,w.jsx)(`strong`,{children:`Loading link configuration`})]}):e.status===`forbidden`?(0,w.jsxs)(`section`,{className:`link-customize-state`,children:[(0,w.jsx)(i,{name:`lock`}),(0,w.jsx)(`strong`,{children:`Link configuration is restricted`})]}):(0,w.jsxs)(`div`,{className:`link-customize-panel`,children:[(0,w.jsx)(`style`,{children:`
        .link-customize-panel {
          --link-text: #172033;
          --link-muted: #687287;
          --link-accent: #6f5cf5;
          display: grid;
          gap: 18px;
          color: var(--link-text);
        }
        .link-customize-heading,
        .link-customize-card,
        .link-customize-state {
          border: 1px solid
            rgba(255, 255, 255, 0.86);
          border-radius: 24px;
          background:
            linear-gradient(
              145deg,
              rgba(255, 255, 255, 0.94),
              rgba(232, 238, 247, 0.84)
            );
          box-shadow:
            12px 12px 28px
              rgba(154, 165, 184, 0.22),
            -10px -10px 26px
              rgba(255, 255, 255, 0.88);
        }
        .link-customize-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 24px;
        }
        .link-customize-heading h2 {
          margin: 5px 0;
        }
        .link-customize-heading p {
          margin: 0;
          color: var(--link-muted);
          line-height: 1.55;
        }
        .link-customize-eyebrow {
          color: var(--link-accent);
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .link-customize-domain {
          display: grid;
          min-width: 200px;
          gap: 4px;
          padding: 13px 16px;
          border-radius: 16px;
          background: #eef3f8;
          box-shadow:
            inset 3px 3px 8px
              rgba(174, 185, 202, 0.24),
            inset -3px -3px 8px
              rgba(255, 255, 255, 0.9);
        }
        .link-customize-domain span {
          color: var(--link-muted);
          font-size: 0.7rem;
        }
        .link-customize-domain strong {
          overflow-wrap: anywhere;
        }
        .link-customize-feedback {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 13px 16px;
          border-radius: 15px;
          font-weight: 700;
        }
        .link-customize-feedback.is-success {
          color: #166534;
          background:
            rgba(34, 197, 94, 0.11);
        }
        .link-customize-feedback.is-error {
          color: #b42318;
          background:
            rgba(239, 68, 68, 0.1);
        }
        .link-customize-grid {
          display: grid;
          grid-template-columns:
            minmax(0, 1.15fr)
            minmax(300px, 0.85fr);
          gap: 18px;
        }
        .link-customize-card {
          padding: 22px;
        }
        .link-customize-card h3 {
          margin: 5px 0;
          font-size: 1.15rem;
        }
        .link-customize-card > p {
          margin: 0 0 18px;
          color: var(--link-muted);
          line-height: 1.55;
        }
        .link-customize-form {
          display: grid;
          gap: 16px;
        }
        .link-customize-field {
          display: grid;
          gap: 7px;
        }
        .link-customize-field > span {
          color: #4e586d;
          font-size: 0.78rem;
          font-weight: 700;
        }
        .link-customize-field select,
        .link-customize-field textarea {
          width: 100%;
          padding: 11px 13px;
          border: 1px solid
            rgba(107, 118, 141, 0.12);
          border-radius: 14px;
          outline: none;
          color: var(--link-text);
          background: #eef3f8;
          box-shadow:
            inset 4px 4px 9px
              rgba(174, 185, 202, 0.24),
            inset -4px -4px 9px
              rgba(255, 255, 255, 0.92);
        }
        .link-customize-field select {
          min-height: 46px;
        }
        .link-customize-field textarea {
          min-height: 120px;
          resize: vertical;
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;
        }
        .link-customize-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 14px;
          border-radius: 15px;
          background:
            rgba(111, 92, 245, 0.06);
        }
        .link-customize-toggle div {
          display: grid;
          gap: 4px;
        }
        .link-customize-toggle strong {
          font-size: 0.84rem;
        }
        .link-customize-toggle small {
          color: var(--link-muted);
          line-height: 1.4;
        }
        .link-customize-toggle input {
          width: 20px;
          height: 20px;
          accent-color: var(--link-accent);
        }
        .link-platform-grid {
          display: grid;
          grid-template-columns:
            repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .link-platform-option {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          border-radius: 14px;
          background: #eef3f8;
          box-shadow:
            5px 5px 12px
              rgba(163, 174, 193, 0.22),
            -5px -5px 12px
              rgba(255, 255, 255, 0.88);
          cursor: pointer;
          font-size: 0.78rem;
          font-weight: 700;
        }
        .link-platform-option input {
          accent-color: var(--link-accent);
        }
        .link-customize-save {
          display: inline-flex;
          width: fit-content;
          min-height: 45px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 19px;
          border: 0;
          border-radius: 14px;
          color: white;
          background:
            linear-gradient(
              135deg,
              #7865f7,
              #5945dc
            );
          box-shadow:
            7px 7px 16px
              rgba(99, 80, 220, 0.24);
          cursor: pointer;
          font-weight: 800;
        }
        .link-customize-save:disabled {
          cursor: wait;
          opacity: 0.6;
        }
        .link-preview-list {
          display: grid;
          gap: 14px;
        }
        .link-preview-item {
          display: grid;
          gap: 8px;
          padding: 15px;
          border-radius: 16px;
          background: #eef3f8;
          box-shadow:
            inset 3px 3px 8px
              rgba(174, 185, 202, 0.22),
            inset -3px -3px 8px
              rgba(255, 255, 255, 0.9);
        }
        .link-preview-item > span {
          color: var(--link-muted);
          font-size: 0.72rem;
          font-weight: 700;
        }
        .link-preview-value {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .link-preview-value code {
          min-width: 0;
          overflow-wrap: anywhere;
          color: #493cb5;
          line-height: 1.55;
        }
        .link-preview-value button {
          display: grid;
          width: 40px;
          height: 40px;
          flex: 0 0 auto;
          place-items: center;
          border: 0;
          border-radius: 12px;
          color: var(--link-accent);
          background: #edf2f8;
          box-shadow:
            5px 5px 12px
              rgba(163, 174, 193, 0.22),
            -5px -5px 12px
              rgba(255, 255, 255, 0.88);
          cursor: pointer;
        }
        .link-customize-note {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          margin-top: 16px;
          padding: 14px;
          border-radius: 15px;
          color: var(--link-muted);
          background:
            rgba(111, 92, 245, 0.07);
          line-height: 1.55;
        }
        .link-customize-state {
          display: grid;
          min-height: 220px;
          place-items: center;
          align-content: center;
          gap: 9px;
          padding: 24px;
        }
        .link-customize-state
        .material-symbols-outlined {
          color: var(--link-accent);
          font-size: 34px;
        }
        @media (max-width: 950px) {
          .link-customize-heading {
            align-items: flex-start;
            flex-direction: column;
          }
          .link-customize-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 680px) {
          .link-platform-grid {
            grid-template-columns: 1fr;
          }
        }
      `}),(0,w.jsxs)(`section`,{className:`link-customize-heading`,children:[(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{className:`link-customize-eyebrow`,children:`Link configuration`}),(0,w.jsx)(`h2`,{children:`Tracking and sharing structure`}),(0,w.jsx)(`p`,{children:`Configure how generated links are displayed, copied, and prepared for social sharing.`})]}),(0,w.jsxs)(`div`,{className:`link-customize-domain`,children:[(0,w.jsx)(`span`,{children:`Preview domain`}),(0,w.jsx)(`strong`,{children:g})]})]}),(p??e.error??d)!==null&&(0,w.jsxs)(`div`,{className:p!==null||e.error!==null?`link-customize-feedback is-error`:`link-customize-feedback is-success`,role:p!==null||e.error!==null?`alert`:`status`,children:[(0,w.jsx)(i,{name:p!==null||e.error!==null?`error`:`check_circle`}),(0,w.jsx)(`span`,{children:p??e.error??d})]}),(0,w.jsxs)(`div`,{className:`link-customize-grid`,children:[(0,w.jsxs)(`section`,{className:`link-customize-card`,children:[(0,w.jsx)(`span`,{className:`link-customize-eyebrow`,children:`Configuration`}),(0,w.jsx)(`h3`,{children:`Link defaults`}),(0,w.jsx)(`p`,{children:`These values define the company-level link presentation and sharing defaults.`}),(0,w.jsxs)(`form`,{className:`link-customize-form`,onSubmit:e=>void x(e),children:[(0,w.jsxs)(`label`,{className:`link-customize-field`,children:[(0,w.jsx)(`span`,{children:`Link identifier structure`}),(0,w.jsxs)(`select`,{disabled:!e.permissions.canCustomize||e.isMutating,onChange:e=>r(e.target.value),value:n,children:[(0,w.jsx)(`option`,{value:`slug_or_code`,children:`Prefer custom slug, otherwise tracking code`}),(0,w.jsx)(`option`,{value:`tracking_code`,children:`Always use tracking code`})]})]}),(0,w.jsxs)(`label`,{className:`link-customize-toggle`,children:[(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`strong`,{children:`Plain-text sharing mode`}),(0,w.jsx)(`small`,{children:`Generate a deliberately non-clickable copy format.`})]}),(0,w.jsx)(`input`,{checked:a,disabled:!e.permissions.canCustomize||e.isMutating,onChange:e=>o(e.target.checked),type:`checkbox`})]}),(0,w.jsxs)(`div`,{className:`link-customize-field`,children:[(0,w.jsx)(`span`,{children:`Restricted sharing platforms`}),(0,w.jsx)(`div`,{className:`link-platform-grid`,children:M.map(t=>(0,w.jsxs)(`label`,{className:`link-platform-option`,children:[(0,w.jsx)(`input`,{checked:s.includes(t.id),disabled:!e.permissions.canCustomize||e.isMutating,onChange:e=>c(n=>L(n,t.id,e.target.checked)),type:`checkbox`}),(0,w.jsx)(i,{name:t.icon}),(0,w.jsx)(`span`,{children:t.label})]},t.id))})]}),(0,w.jsxs)(`label`,{className:`link-customize-field`,children:[(0,w.jsx)(`span`,{children:`Default query parameters`}),(0,w.jsx)(`textarea`,{disabled:!e.permissions.canCustomize||e.isMutating,onChange:e=>u(e.target.value),placeholder:`utm_source=publisher
utm_medium=affiliate`,spellCheck:!1,value:l})]}),v!==null&&(0,w.jsxs)(`div`,{className:`link-customize-feedback is-error`,children:[(0,w.jsx)(i,{name:`error`}),(0,w.jsx)(`span`,{children:v})]}),e.permissions.canCustomize&&(0,w.jsxs)(`button`,{className:`link-customize-save`,disabled:e.isMutating||v!==null,type:`submit`,children:[(0,w.jsx)(i,{name:`save`}),e.isMutating?`Saving...`:`Save link settings`]})]})]}),(0,w.jsxs)(`section`,{className:`link-customize-card`,children:[(0,w.jsx)(`span`,{className:`link-customize-eyebrow`,children:`Live preview`}),(0,w.jsx)(`h3`,{children:`Copy formats`}),(0,w.jsx)(`p`,{children:`Preview updates immediately as the configuration changes.`}),(0,w.jsxs)(`div`,{className:`link-preview-list`,children:[(0,w.jsxs)(`div`,{className:`link-preview-item`,children:[(0,w.jsx)(`span`,{children:`Normal tracking URL`}),(0,w.jsxs)(`div`,{className:`link-preview-value`,children:[(0,w.jsx)(`code`,{children:y}),(0,w.jsx)(`button`,{"aria-label":`Copy normal URL`,onClick:()=>void T(y,`Normal tracking URL`),title:`Copy normal URL`,type:`button`,children:(0,w.jsx)(i,{name:`content_copy`})})]})]}),(0,w.jsxs)(`div`,{className:`link-preview-item`,children:[(0,w.jsx)(`span`,{children:`Plain-text sharing format`}),(0,w.jsxs)(`div`,{className:`link-preview-value`,children:[(0,w.jsx)(`code`,{children:a?b:`Plain-text sharing is disabled`}),(0,w.jsx)(`button`,{"aria-label":`Copy plain-text URL`,disabled:!a,onClick:()=>void T(b,`Plain-text tracking URL`),title:`Copy plain-text URL`,type:`button`,children:(0,w.jsx)(i,{name:`content_copy`})})]})]})]}),(0,w.jsxs)(`p`,{className:`link-customize-note`,children:[(0,w.jsx)(i,{name:`info`}),`Plain-text mode removes the protocol and replaces hostname dots with [.] so the copied value is not a normal clickable URL. Snapchat, Instagram, Facebook, and other apps still control their own auto-linking behavior.`]})]})]})]})}function ee(e){if(!c(e))throw Error(`The API returned an invalid response envelope.`);return e.data}function z(e,t){let n=ee(e);if(!c(n))throw Error(`The API returned an invalid response payload.`);return n[t]}function B(e,t){if(typeof e!=`boolean`)throw Error(`The API returned an invalid ${t}.`);return e}function V(e,t){let n=d(e,t);if(!Number.isInteger(n))throw Error(`The API returned an invalid ${t}.`);return n}function te(e){if(e===`ipqualityscore`||e===`proxycheck`)return e;throw Error(`The API returned an unsupported Proxy provider.`)}function ne(e){if(e===`active`||e===`disabled`)return e;throw Error(`The API returned an unsupported Proxy status.`)}function re(e){if(e===`monitor`||e===`enforce`)return e;throw Error(`The API returned an unsupported Proxy enforcement mode.`)}function ie(e){if(e===`allow`||e===`flag`||e===`block`)return e;throw Error(`The API returned an unsupported Proxy failure behavior.`)}function ae(e){if(e===null||e===`passed`||e===`failed`)return e;throw Error(`The API returned an unsupported Proxy test status.`)}function H(e){if(!Array.isArray(e))throw Error(`The API returned invalid Proxy bypass memberships.`);return Object.freeze(e.map(e=>f(e,`Proxy bypass membership ID`)))}function U(e){if(!c(e))throw Error(`The API returned an invalid Proxy configuration.`);return Object.freeze({id:f(e.id,`Proxy configuration ID`),companyId:f(e.companyId,`Proxy company ID`),providerCode:te(e.providerCode),apiKeyLast4:f(e.apiKeyLast4,`Proxy API-key suffix`),hasApiKey:B(e.hasApiKey,`Proxy API-key status`),status:ne(e.status),enforcementMode:re(e.enforcementMode),riskThreshold:V(e.riskThreshold,`Proxy risk threshold`),requestTimeoutMs:V(e.requestTimeoutMs,`Proxy request timeout`),cacheTtlSeconds:V(e.cacheTtlSeconds,`Proxy cache duration`),failureBehavior:ie(e.failureBehavior),detectProxy:B(e.detectProxy,`Proxy detection setting`),detectVpn:B(e.detectVpn,`VPN detection setting`),detectTor:B(e.detectTor,`Tor detection setting`),bypassOwnerMembershipIds:H(e.bypassOwnerMembershipIds),apiKeyUpdatedAt:f(e.apiKeyUpdatedAt,`Proxy API-key update time`),lastTestedAt:o(e.lastTestedAt,`Proxy last-tested time`),lastTestStatus:ae(e.lastTestStatus),lastTestErrorCode:o(e.lastTestErrorCode,`Proxy test error code`),createdBy:o(e.createdBy,`Proxy creator ID`),updatedBy:o(e.updatedBy,`Proxy updater ID`),createdAt:f(e.createdAt,`Proxy creation time`),updatedAt:f(e.updatedAt,`Proxy update time`)})}function W(e){return e===null?null:U(e)}async function G(e,t,n){return W(z(await u(e,`/companies/${t}/proxy`,{companyId:t,...n===void 0?{}:{signal:n}}),`proxyConfiguration`))}async function K(e,t,n){return U(z(await u(e,`/companies/${t}/proxy`,{method:`PUT`,companyId:t,body:n}),`proxyConfiguration`))}var q=[`company-scoped`,`proxy-configuration`];function oe(e){return e===null?null:e instanceof Error?e.message:`Proxy configuration could not be loaded.`}function se(e,t,n,r){return t?e?n?`loading`:r?`error`:`ready`:`idle`:`forbidden`}function ce(){let e=n(),t=p(),r=e.session,i=t.activeCompanyId,o=e.identity?.authorization.platformRole===`platform_super_admin`,c=e.identity?.authorization.companyMembership?.role===`company_admin`,u=o||c,d=r!==null&&i!==null&&u,f=a({queryKey:[...q,i],enabled:d,queryFn:({signal:e})=>{if(r===null||i===null)throw Error(`An authenticated company context is required.`);return G(r.access_token,i,e)}}),m=l({mutationFn:async e=>{if(r===null||i===null||!u)throw Error(`Company administrator access is required to configure Proxy detection.`);return K(r.access_token,i,e)},onSettled:(0,C.useCallback)(async()=>{await s.invalidateQueries({queryKey:q}),await s.invalidateQueries({queryKey:[`company-scoped`,`tenant-administration`,`audit`]})},[])});return{companyId:i,companyName:t.activeCompany?.name??`Selected company`,permissions:{platformAdmin:o,canManage:u},configuration:f.data??null,status:se(d,u,f.isLoading,f.isError),error:oe(f.error??m.error),isMutating:m.isPending,updateConfiguration:m.mutateAsync,refresh:async()=>{await f.refetch()}}}var le={ipqualityscore:`IPQualityScore`,proxycheck:`ProxyCheck`};function J(e,t,n,r){let i=String(e??``).trim();if(i.length===0)throw Error(t+` is required.`);let a=Number(i);if(!Number.isInteger(a)||a<n||a>r)throw Error(t+` must be a whole number between `+String(n)+` and `+String(r)+`.`);return a}function ue({configuration:e,companyName:t,canManage:n,isMutating:r,apiError:a,save:o}){let s=x({search:``,role:``,membershipStatus:`active`,userStatus:`active`}),c=(0,C.useMemo)(()=>s.directory.items.filter(e=>e.membershipStatus===`active`&&e.userStatus===`active`&&(e.role===`manager`||e.role===`publisher`)),[s.directory.items]),[l,u]=(0,C.useState)(e?.providerCode??`ipqualityscore`),[d,f]=(0,C.useState)(e?.status??`disabled`),[p,m]=(0,C.useState)(e?.enforcementMode??`monitor`),[h,g]=(0,C.useState)(e?.failureBehavior??`flag`),[_,v]=(0,C.useState)(e?.detectProxy??!0),[y,S]=(0,C.useState)(e?.detectVpn??!0),[T,E]=(0,C.useState)(e?.detectTor??!0),[D,O]=(0,C.useState)(e?.bypassOwnerMembershipIds??[]),[k,A]=(0,C.useState)(null),[j,M]=(0,C.useState)(null);function N(e,t){O(n=>t?n.includes(e)?n:[...n,e]:n.filter(t=>t!==e))}async function P(n){n.preventDefault(),A(null),M(null);let r=new FormData(n.currentTarget),i=String(r.get(`apiKey`)??``).trim();if(e===null&&i.length<4){M(`Enter the provider API key before creating the configuration.`);return}if(e!==null&&l!==e.providerCode&&i.length<4){M(`Enter a new API key when changing the provider.`);return}if(d===`active`&&!_&&!y&&!T){M(`Enable at least one Proxy, VPN, or Tor detection signal.`);return}try{let e=await o({providerCode:l,...i.length>0?{apiKey:i}:{},status:d,enforcementMode:p,riskThreshold:J(r.get(`riskThreshold`),`Risk threshold`,0,100),requestTimeoutMs:J(r.get(`requestTimeoutMs`),`Request timeout`,250,5e3),cacheTtlSeconds:J(r.get(`cacheTtlSeconds`),`Cache duration`,60,86400),failureBehavior:h,detectProxy:_,detectVpn:y,detectTor:T,bypassOwnerMembershipIds:D});A(`Proxy configuration for `+t+` was saved. Encrypted key ending in `+e.apiKeyLast4+`.`)}catch(e){M(e instanceof Error?e.message:`Proxy configuration could not be saved.`)}}let F=j??a??s.error,I=e?.hasApiKey===!0?`???? `+e.apiKeyLast4:`Not configured`;return(0,w.jsxs)(`div`,{className:`proxy-customize-panel`,children:[(0,w.jsxs)(`section`,{className:`customize-neumorphic-panel link-customize-hero`,children:[(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{className:`customize-eyebrow`,children:`Traffic Protection`}),(0,w.jsx)(`h2`,{children:`Proxy and VPN detection`}),(0,w.jsx)(`p`,{children:`Configure a company-level IP-risk provider without exposing provider credentials to browser responses.`})]}),(0,w.jsxs)(`div`,{className:`link-customize-domain`,children:[(0,w.jsx)(`span`,{children:`Provider`}),(0,w.jsx)(`strong`,{children:le[l]})]})]}),(F!==null||k!==null)&&(0,w.jsxs)(`div`,{className:F===null?`link-customize-feedback is-success`:`link-customize-feedback is-error`,role:F===null?`status`:`alert`,children:[(0,w.jsx)(i,{name:F===null?`check_circle`:`error`}),(0,w.jsx)(`span`,{children:F??k})]}),(0,w.jsxs)(`div`,{className:`link-customize-grid`,children:[(0,w.jsxs)(`section`,{className:`link-customize-card`,children:[(0,w.jsx)(`span`,{className:`link-customize-eyebrow`,children:`Provider configuration`}),(0,w.jsx)(`h3`,{children:`Detection policy`}),(0,w.jsx)(`p`,{children:`Provider credentials are encrypted by the backend before database storage.`}),(0,w.jsxs)(`form`,{className:`link-customize-form`,onSubmit:e=>void P(e),children:[(0,w.jsxs)(`label`,{className:`link-customize-field`,children:[(0,w.jsx)(`span`,{children:`Proxy detection provider`}),(0,w.jsxs)(`select`,{disabled:!n||r,onChange:e=>u(e.target.value),value:l,children:[(0,w.jsx)(`option`,{value:`ipqualityscore`,children:`IPQualityScore`}),(0,w.jsx)(`option`,{value:`proxycheck`,children:`ProxyCheck`})]})]}),(0,w.jsxs)(`label`,{className:`link-customize-field`,children:[(0,w.jsx)(`span`,{children:`Provider API key`}),(0,w.jsx)(`input`,{autoComplete:`new-password`,disabled:!n||r,name:`apiKey`,placeholder:e===null?`Enter provider API key`:`Leave blank to keep `+I,type:`password`}),(0,w.jsxs)(`small`,{children:[`Existing secret:`,` `,I]})]}),(0,w.jsxs)(`div`,{className:`customize-form-grid`,children:[(0,w.jsxs)(`label`,{className:`link-customize-field`,children:[(0,w.jsx)(`span`,{children:`Status`}),(0,w.jsxs)(`select`,{disabled:!n||r,onChange:e=>f(e.target.value),value:d,children:[(0,w.jsx)(`option`,{value:`disabled`,children:`Disabled`}),(0,w.jsx)(`option`,{value:`active`,children:`Active`})]})]}),(0,w.jsxs)(`label`,{className:`link-customize-field`,children:[(0,w.jsx)(`span`,{children:`Enforcement mode`}),(0,w.jsxs)(`select`,{disabled:!n||r,onChange:e=>m(e.target.value),value:p,children:[(0,w.jsx)(`option`,{value:`monitor`,children:`Monitor only`}),(0,w.jsx)(`option`,{value:`enforce`,children:`Enforce decisions`})]})]})]}),(0,w.jsxs)(`div`,{className:`customize-form-grid`,children:[(0,w.jsxs)(`label`,{className:`link-customize-field`,children:[(0,w.jsx)(`span`,{children:`Risk threshold`}),(0,w.jsx)(`input`,{defaultValue:e?.riskThreshold??75,disabled:!n||r,max:`100`,min:`0`,name:`riskThreshold`,required:!0,type:`number`})]}),(0,w.jsxs)(`label`,{className:`link-customize-field`,children:[(0,w.jsx)(`span`,{children:`Request timeout (milliseconds)`}),(0,w.jsx)(`input`,{defaultValue:e?.requestTimeoutMs??1500,disabled:!n||r,max:`5000`,min:`250`,name:`requestTimeoutMs`,required:!0,type:`number`})]})]}),(0,w.jsxs)(`div`,{className:`customize-form-grid`,children:[(0,w.jsxs)(`label`,{className:`link-customize-field`,children:[(0,w.jsx)(`span`,{children:`Cache duration (seconds)`}),(0,w.jsx)(`input`,{defaultValue:e?.cacheTtlSeconds??3600,disabled:!n||r,max:`86400`,min:`60`,name:`cacheTtlSeconds`,required:!0,type:`number`})]}),(0,w.jsxs)(`label`,{className:`link-customize-field`,children:[(0,w.jsx)(`span`,{children:`Provider failure policy`}),(0,w.jsxs)(`select`,{disabled:!n||r,onChange:e=>g(e.target.value),value:h,children:[(0,w.jsx)(`option`,{value:`allow`,children:`Allow click`}),(0,w.jsx)(`option`,{value:`flag`,children:`Flag for review`}),(0,w.jsx)(`option`,{value:`block`,children:`Block click`})]})]})]}),(0,w.jsxs)(`div`,{className:`link-customize-field`,children:[(0,w.jsx)(`span`,{children:`Detection signals`}),(0,w.jsxs)(`div`,{className:`link-platform-grid`,children:[(0,w.jsxs)(`label`,{className:`link-platform-option`,children:[(0,w.jsx)(`input`,{checked:_,disabled:!n||r,onChange:e=>v(e.target.checked),type:`checkbox`}),(0,w.jsx)(i,{name:`shield`}),(0,w.jsx)(`span`,{children:`Proxy`})]}),(0,w.jsxs)(`label`,{className:`link-platform-option`,children:[(0,w.jsx)(`input`,{checked:y,disabled:!n||r,onChange:e=>S(e.target.checked),type:`checkbox`}),(0,w.jsx)(i,{name:`vpn_lock`}),(0,w.jsx)(`span`,{children:`VPN`})]}),(0,w.jsxs)(`label`,{className:`link-platform-option`,children:[(0,w.jsx)(`input`,{checked:T,disabled:!n||r,onChange:e=>E(e.target.checked),type:`checkbox`}),(0,w.jsx)(i,{name:`hub`}),(0,w.jsx)(`span`,{children:`Tor`})]})]})]}),n&&(0,w.jsxs)(`button`,{className:`link-customize-save`,disabled:r,type:`submit`,children:[(0,w.jsx)(i,{name:`save`}),r?`Saving...`:`Save proxy settings`]})]})]}),(0,w.jsxs)(`section`,{className:`link-customize-card`,children:[(0,w.jsx)(`span`,{className:`link-customize-eyebrow`,children:`Bypass rules`}),(0,w.jsx)(`h3`,{children:`Manager and Publisher bypass`}),(0,w.jsx)(`p`,{children:`Selected tracking-link owners skip the external provider lookup.`}),s.status===`loading`?(0,w.jsxs)(`div`,{className:`customize-form-note`,children:[(0,w.jsx)(i,{className:`spin`,name:`progress_activity`}),`Loading eligible members...`]}):c.length===0?(0,w.jsxs)(`div`,{className:`customize-form-note`,children:[(0,w.jsx)(i,{name:`group_off`}),`No active Manager or Publisher memberships are available.`]}):(0,w.jsx)(`div`,{className:`link-platform-grid`,children:c.map(e=>(0,w.jsxs)(`label`,{className:`link-platform-option`,children:[(0,w.jsx)(`input`,{checked:D.includes(e.membershipId),disabled:!n||r,onChange:t=>N(e.membershipId,t.target.checked),type:`checkbox`}),(0,w.jsx)(i,{name:e.role===`manager`?`manage_accounts`:`person`}),(0,w.jsx)(`span`,{children:e.displayName??e.email??e.userId.slice(0,12)})]},e.membershipId))}),(0,w.jsxs)(`div`,{className:`link-preview-list`,children:[(0,w.jsxs)(`div`,{className:`link-preview-item`,children:[(0,w.jsx)(`span`,{children:`Current configuration`}),(0,w.jsx)(`div`,{className:`link-preview-value`,children:(0,w.jsx)(`code`,{children:e===null?`Not configured`:e.status+` / `+e.enforcementMode})})]}),(0,w.jsxs)(`div`,{className:`link-preview-item`,children:[(0,w.jsx)(`span`,{children:`Saved API key`}),(0,w.jsx)(`div`,{className:`link-preview-value`,children:(0,w.jsx)(`code`,{children:I})})]}),(0,w.jsxs)(`div`,{className:`link-preview-item`,children:[(0,w.jsx)(`span`,{children:`Last updated`}),(0,w.jsx)(`div`,{className:`link-preview-value`,children:(0,w.jsx)(`code`,{children:e===null?`Not saved`:b(e.updatedAt)})})]})]}),(0,w.jsxs)(`p`,{className:`customize-form-note`,children:[(0,w.jsx)(i,{name:`info`}),`Secure configuration storage is active. Live provider checks will be connected to the tracker redirect flow in the next runtime batch.`]})]})]})]})}function de(){let e=ce();return e.status===`loading`||e.status===`idle`?(0,w.jsxs)(`section`,{className:`customize-neumorphic-panel customize-pending-panel`,children:[(0,w.jsx)(`div`,{className:`customize-pending-icon`,children:(0,w.jsx)(i,{className:`spin`,name:`progress_activity`})}),(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{className:`customize-eyebrow`,children:`Loading configuration`}),(0,w.jsx)(`h2`,{children:`Proxy configuration`}),(0,w.jsx)(`p`,{children:`Reading the encrypted company Proxy settings.`})]})]}):e.status===`forbidden`?(0,w.jsxs)(`section`,{className:`customize-neumorphic-panel customize-pending-panel`,children:[(0,w.jsx)(`div`,{className:`customize-pending-icon`,children:(0,w.jsx)(i,{name:`lock`})}),(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{className:`customize-eyebrow`,children:`Restricted configuration`}),(0,w.jsx)(`h2`,{children:`Proxy configuration`}),(0,w.jsx)(`p`,{children:`Platform Super Admin or Company Admin access is required.`})]})]}):(0,w.jsx)(ue,{apiError:e.error,canManage:e.permissions.canManage,companyName:e.companyName,configuration:e.configuration,isMutating:e.isMutating,save:e.updateConfiguration},e.configuration?.updatedAt??`proxy-empty`)}var Y=`smtp-relay.brevo.com`;function X(e,t){if(!c(e)||!c(e.data))throw Error(`The API returned an invalid SMTP response.`);return e.data[t]}function fe(e,t){if(typeof e!=`boolean`)throw Error(`The API returned an invalid ${t}.`);return e}function pe(e){if(e===`plain`||e===`starttls`||e===`tls`)return e;throw Error(`The API returned an invalid SMTP security mode.`)}function me(e){if(e===`active`||e===`disabled`)return e;throw Error(`The API returned an invalid SMTP status.`)}function he(e){if(e===null)return null;if(e===`pending`||e===`sent`||e===`failed`)return e;throw Error(`The API returned an invalid SMTP test status.`)}function Z(e){if(!c(e))throw Error(`The API returned an invalid SMTP configuration.`);let t=d(e.port,`SMTP port`);if(!Number.isInteger(t))throw Error(`The API returned an invalid SMTP port.`);return{host:f(e.host,`SMTP host`),port:t,secureMode:pe(e.secureMode),username:f(e.username,`SMTP username`),senderEmail:f(e.senderEmail,`SMTP sender email`),senderName:f(e.senderName,`SMTP sender name`),replyToEmail:o(e.replyToEmail,`SMTP reply-to email`),status:me(e.status),hasPassword:fe(e.hasPassword,`SMTP password state`),passwordUpdatedAt:f(e.passwordUpdatedAt,`SMTP password update time`),lastTestedAt:o(e.lastTestedAt,`SMTP last test time`),lastTestStatus:he(e.lastTestStatus),updatedAt:f(e.updatedAt,`SMTP update time`)}}async function ge(e,t,n){let r=X(await u(e,`/companies/${t}/smtp`,{companyId:t,...n===void 0?{}:{signal:n}}),`smtpConfiguration`);return r===null?null:Z(r)}async function _e(e,t,n){return Z(X(await u(e,`/companies/${t}/smtp`,{method:`PUT`,companyId:t,body:n}),`smtpConfiguration`))}async function ve(e,t,n){let r=X(await u(e,`/companies/${t}/smtp/test`,{method:`POST`,companyId:t,body:{recipientEmail:n}}),`result`);if(!c(r))throw Error(`The API returned an invalid SMTP test result.`);if(f(r.status,`SMTP test status`)!==`sent`)throw Error(`The SMTP test was not completed.`);return{recipientEmail:f(r.recipientEmail,`SMTP test recipient`),completedAt:f(r.completedAt,`SMTP test completion time`)}}function ye(e){let t=Number(e);if(!Number.isInteger(t)||t<1||t>65535)throw Error(`SMTP port must be between 1 and 65535.`);return t}function be(e){let t=e.trim().toLowerCase();return t.length===0?null:t}function xe(e){return e===null?`Not tested`:e.replaceAll(`_`,` `).replace(/\b\w/gu,e=>e.toUpperCase())}function Q(e){return e===null?null:e instanceof Error?e.message:`SMTP operation failed.`}function Se({companyName:e,configuration:t,isSaving:n,isTesting:r,save:a,test:o}){let[s,c]=(0,C.useState)(t?.host??Y),[l,u]=(0,C.useState)(String(t?.port??587)),[d,f]=(0,C.useState)(t?.secureMode??`starttls`),[p,m]=(0,C.useState)(t?.username??``),[h,g]=(0,C.useState)(``),[_,v]=(0,C.useState)(t?.senderEmail??``),[y,x]=(0,C.useState)(t?.senderName??e),[S,T]=(0,C.useState)(t?.replyToEmail??``),[E,D]=(0,C.useState)(t?.status??`disabled`),[O,k]=(0,C.useState)(t?.senderEmail??``),[A,j]=(0,C.useState)(null),[M,N]=(0,C.useState)(null);function P(){c(Y),u(`587`),f(`starttls`),D(`active`),N(null),j(`Brevo preset applied. Enter the Brevo SMTP login and SMTP key before saving.`)}async function F(e){e.preventDefault(),j(null),N(null);try{let e=h.trim();if(t===null&&e.length===0)throw Error(`SMTP key or password is required for the first save.`);let n=await a({host:s.trim(),port:ye(l),secureMode:d,username:p.trim(),...e.length>0?{password:e}:{},senderEmail:_.trim().toLowerCase(),senderName:y.trim(),replyToEmail:be(S),status:E});g(``),j(`SMTP configuration saved for ${n.senderEmail}. The password remains encrypted and hidden.`)}catch(e){N(e instanceof Error?e.message:`SMTP configuration could not be saved.`)}}async function I(e){e.preventDefault(),j(null),N(null);try{let e=O.trim().toLowerCase();if(e.length===0)throw Error(`Enter a test recipient email.`);let t=await o(e);j(`Test email sent to ${t.recipientEmail} at ${b(t.completedAt)}.`)}catch(e){N(e instanceof Error?e.message:`SMTP test email could not be sent.`)}}return(0,w.jsxs)(`div`,{className:`smtp-customize-shell`,children:[(0,w.jsxs)(`section`,{className:`customize-neumorphic-panel smtp-customize-hero`,children:[(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{className:`customize-eyebrow`,children:`Transactional email`}),(0,w.jsx)(`h2`,{children:`SMTP and Brevo delivery`}),(0,w.jsx)(`p`,{children:`Configure encrypted company email delivery, sender identity, connection security and live test messages.`})]}),(0,w.jsxs)(`button`,{className:`smtp-brevo-button`,onClick:P,type:`button`,children:[(0,w.jsx)(i,{name:`bolt`}),`Apply Brevo preset`]})]}),(A!==null||M!==null)&&(0,w.jsxs)(`div`,{className:M===null?`smtp-feedback smtp-feedback--success`:`smtp-feedback smtp-feedback--error`,children:[(0,w.jsx)(i,{name:M===null?`check_circle`:`error`}),(0,w.jsx)(`span`,{children:M??A})]}),(0,w.jsxs)(`div`,{className:`smtp-customize-grid`,children:[(0,w.jsxs)(`form`,{className:`customize-neumorphic-panel smtp-config-card`,onSubmit:e=>void F(e),children:[(0,w.jsxs)(`div`,{className:`smtp-card-heading`,children:[(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{children:`Connection`}),(0,w.jsx)(`h3`,{children:`SMTP credentials`})]}),(0,w.jsx)(`span`,{className:E===`active`?`smtp-state smtp-state--active`:`smtp-state`,children:E})]}),(0,w.jsxs)(`div`,{className:`smtp-form-grid`,children:[(0,w.jsxs)(`label`,{className:`smtp-field smtp-field--wide`,children:[(0,w.jsx)(`span`,{children:`SMTP host`}),(0,w.jsx)(`input`,{autoComplete:`off`,onChange:e=>c(e.target.value),placeholder:Y,required:!0,value:s})]}),(0,w.jsxs)(`label`,{className:`smtp-field`,children:[(0,w.jsx)(`span`,{children:`Port`}),(0,w.jsx)(`input`,{max:`65535`,min:`1`,onChange:e=>u(e.target.value),required:!0,type:`number`,value:l})]}),(0,w.jsxs)(`label`,{className:`smtp-field`,children:[(0,w.jsx)(`span`,{children:`Security`}),(0,w.jsxs)(`select`,{onChange:e=>f(e.target.value),value:d,children:[(0,w.jsx)(`option`,{value:`starttls`,children:`STARTTLS`}),(0,w.jsx)(`option`,{value:`tls`,children:`TLS`}),(0,w.jsx)(`option`,{value:`plain`,children:`Plain`})]})]}),(0,w.jsxs)(`label`,{className:`smtp-field smtp-field--wide`,children:[(0,w.jsx)(`span`,{children:`SMTP login / username`}),(0,w.jsx)(`input`,{autoComplete:`username`,onChange:e=>m(e.target.value),placeholder:`Brevo SMTP login`,required:!0,value:p})]}),(0,w.jsxs)(`label`,{className:`smtp-field smtp-field--wide`,children:[(0,w.jsx)(`span`,{children:`SMTP key / password`}),(0,w.jsx)(`input`,{autoComplete:`new-password`,onChange:e=>g(e.target.value),placeholder:t?.hasPassword===!0?`Leave blank to keep the encrypted password`:`Required for the first save`,required:t===null||!t.hasPassword,type:`password`,value:h}),(0,w.jsx)(`small`,{children:`The credential is sent only when changed and is never returned to the browser.`})]}),(0,w.jsxs)(`label`,{className:`smtp-field`,children:[(0,w.jsx)(`span`,{children:`Sender name`}),(0,w.jsx)(`input`,{onChange:e=>x(e.target.value),required:!0,value:y})]}),(0,w.jsxs)(`label`,{className:`smtp-field`,children:[(0,w.jsx)(`span`,{children:`Sender email`}),(0,w.jsx)(`input`,{onChange:e=>v(e.target.value),placeholder:`no-reply@example.com`,required:!0,type:`email`,value:_})]}),(0,w.jsxs)(`label`,{className:`smtp-field`,children:[(0,w.jsx)(`span`,{children:`Reply-to email`}),(0,w.jsx)(`input`,{onChange:e=>T(e.target.value),placeholder:`support@example.com`,type:`email`,value:S})]}),(0,w.jsxs)(`label`,{className:`smtp-field`,children:[(0,w.jsx)(`span`,{children:`Delivery status`}),(0,w.jsxs)(`select`,{onChange:e=>D(e.target.value),value:E,children:[(0,w.jsx)(`option`,{value:`active`,children:`Active`}),(0,w.jsx)(`option`,{value:`disabled`,children:`Disabled`})]})]})]}),(0,w.jsxs)(`button`,{className:`primary-gradient-button`,disabled:n,type:`submit`,children:[(0,w.jsx)(i,{name:`save`}),n?`Saving...`:`Save SMTP settings`]})]}),(0,w.jsxs)(`div`,{className:`smtp-side-stack`,children:[(0,w.jsxs)(`section`,{className:`customize-neumorphic-panel smtp-status-card`,children:[(0,w.jsxs)(`div`,{className:`smtp-card-heading`,children:[(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{children:`Security`}),(0,w.jsx)(`h3`,{children:`Credential status`})]}),(0,w.jsx)(i,{name:`encrypted`})]}),(0,w.jsxs)(`dl`,{className:`smtp-detail-list`,children:[(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`dt`,{children:`Password`}),(0,w.jsx)(`dd`,{children:t?.hasPassword===!0?`Encrypted and stored`:`Not configured`})]}),(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`dt`,{children:`Password updated`}),(0,w.jsx)(`dd`,{children:t===null?`Not available`:b(t.passwordUpdatedAt)})]}),(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`dt`,{children:`Last test`}),(0,w.jsx)(`dd`,{children:t?.lastTestedAt===null||t===null?`Not tested`:b(t.lastTestedAt)})]}),(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`dt`,{children:`Test result`}),(0,w.jsx)(`dd`,{children:xe(t?.lastTestStatus??null)})]})]})]}),(0,w.jsxs)(`form`,{className:`customize-neumorphic-panel smtp-test-card`,onSubmit:e=>void I(e),children:[(0,w.jsxs)(`div`,{className:`smtp-card-heading`,children:[(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`span`,{children:`Verification`}),(0,w.jsx)(`h3`,{children:`Send test email`})]}),(0,w.jsx)(i,{name:`outgoing_mail`})]}),(0,w.jsx)(`p`,{children:`Save and activate the configuration, then send a real SMTP test message.`}),(0,w.jsxs)(`label`,{className:`smtp-field`,children:[(0,w.jsx)(`span`,{children:`Recipient email`}),(0,w.jsx)(`input`,{onChange:e=>k(e.target.value),placeholder:`you@example.com`,required:!0,type:`email`,value:O})]}),(0,w.jsxs)(`button`,{className:`smtp-secondary-button`,disabled:r||t===null||t.status!==`active`,type:`submit`,children:[(0,w.jsx)(i,{name:`send`}),r?`Sending...`:`Send test email`]})]})]})]})]})}function Ce(){let e=n(),t=p(),r=e.session?.access_token??null,o=t.activeCompanyId,c=e.identity?.authorization.companyMembership??null,u=e.identity?.authorization.platformRole===`platform_super_admin`||c?.role===`company_admin`&&c.status===`active`,d=a({queryKey:[`company-scoped`,`smtp`,o],enabled:u&&r!==null&&o!==null,queryFn:({signal:e})=>{if(r===null||o===null)throw Error(`An authenticated company context is required.`);return ge(r,o,e)}}),f=l({mutationFn:e=>{if(r===null||o===null||!u)throw Error(`Company administrator access is required.`);return _e(r,o,e)},onSuccess:async()=>{await s.invalidateQueries({queryKey:[`company-scoped`,`smtp`,o]})}}),m=l({mutationFn:e=>{if(r===null||o===null||!u)throw Error(`Company administrator access is required.`);return ve(r,o,e)},onSuccess:async()=>{await s.invalidateQueries({queryKey:[`company-scoped`,`smtp`,o]})}});return u?r===null||o===null?(0,w.jsxs)(`section`,{className:`customize-neumorphic-panel smtp-system-state smtp-system-state--error`,children:[(0,w.jsx)(i,{name:`domain_disabled`}),(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`strong`,{children:`Select a company`}),(0,w.jsx)(`span`,{children:`An authenticated company context is required.`})]})]}):d.isLoading?(0,w.jsxs)(`section`,{className:`customize-neumorphic-panel smtp-system-state`,children:[(0,w.jsx)(i,{className:`spin`,name:`progress_activity`}),(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`strong`,{children:`Loading SMTP configuration`}),(0,w.jsx)(`span`,{children:`Reading encrypted company delivery settings.`})]})]}):d.isError&&d.data===void 0?(0,w.jsxs)(`section`,{className:`customize-neumorphic-panel smtp-system-state smtp-system-state--error`,children:[(0,w.jsx)(i,{name:`cloud_off`}),(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`strong`,{children:`SMTP configuration could not be loaded`}),(0,w.jsx)(`span`,{children:Q(d.error)})]}),(0,w.jsx)(`button`,{onClick:()=>void d.refetch(),type:`button`,children:`Retry`})]}):(0,w.jsx)(Se,{companyName:t.activeCompany?.name??`Selected company`,configuration:d.data??null,isSaving:f.isPending,isTesting:m.isPending,save:f.mutateAsync,test:m.mutateAsync},d.data?.updatedAt??`smtp-empty`):(0,w.jsxs)(`section`,{className:`customize-neumorphic-panel smtp-system-state`,children:[(0,w.jsx)(i,{name:`lock`}),(0,w.jsxs)(`div`,{children:[(0,w.jsx)(`strong`,{children:`SMTP access restricted`}),(0,w.jsx)(`span`,{children:`Platform Super Admin or active Company Admin access is required.`})]})]})}function $(e){let t=String(e??``).trim();return t.length===0?null:t}var we=[{id:`general`,label:`General`,icon:`tune`,description:`Branding and operational defaults`},{id:`domain`,label:`Domain`,icon:`language`,description:`Tracking-domain configuration`},{id:`link`,label:`Link`,icon:`link`,description:`Tracking and sharing structure`},{id:`proxy`,label:`Proxy`,icon:`security`,description:`Proxy and VPN detection`},{id:`smtp`,label:`SMTP`,icon:`mail`,description:`Brevo email delivery`}];function Te(){let e=n(),t=m(),[r,a]=(0,C.useState)(`general`),[o,s]=(0,C.useState)(null),[c,l]=(0,C.useState)(null);if(t.status===`loading`||t.status===`idle`)return(0,w.jsx)(h,{label:`customization`});if(t.status===`forbidden`)return(0,w.jsx)(y,{message:`Select an accessible company to view customization settings.`,title:`Customize unavailable`});async function u(e){e.preventDefault(),s(null),l(null);try{let n=new FormData(e.currentTarget);await t.updateCustomization({brandName:$(n.get(`brandName`)),tagline:$(n.get(`tagline`)),logoUrl:$(n.get(`logoUrl`)),primaryColor:$(n.get(`primaryColor`)),secondaryColor:$(n.get(`secondaryColor`)),supportEmail:$(n.get(`supportEmail`)),defaultCurrency:$(n.get(`defaultCurrency`)),defaultTimezone:$(n.get(`defaultTimezone`))}),s(`General customization settings were saved.`)}catch(e){l(e instanceof Error?e.message:`General customization update failed.`)}}let d=e.identity?.authorization.companyMembership?.role??null,f=e.identity?.authorization.platformRole??null,p=t.customization?.updatedAt??`empty`;return(0,w.jsxs)(`div`,{className:`control-page customize-page`,children:[(0,w.jsx)(`style`,{children:`
        .customize-page {
          --customize-bg: #edf2f7;
          --customize-surface: rgba(255, 255, 255, 0.78);
          --customize-surface-solid: #f7f9fc;
          --customize-text: #172033;
          --customize-muted: #687287;
          --customize-accent: #6f5cf5;
          --customize-border: rgba(111, 92, 245, 0.13);
          color: var(--customize-text);
        }
        .customize-shell {
          padding: 22px;
          border: 1px solid rgba(255, 255, 255, 0.82);
          border-radius: 28px;
          background:
            linear-gradient(
              145deg,
              rgba(255, 255, 255, 0.92),
              rgba(232, 238, 247, 0.78)
            );
          box-shadow:
            18px 18px 42px rgba(151, 163, 184, 0.28),
            -16px -16px 38px rgba(255, 255, 255, 0.86);
          backdrop-filter: blur(22px);
        }
        .customize-tab-navigation {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 22px;
        }
        .customize-tab-button {
          display: flex;
          min-height: 88px;
          align-items: center;
          gap: 12px;
          padding: 15px;
          border: 1px solid transparent;
          border-radius: 20px;
          color: var(--customize-muted);
          background: #eef3f9;
          box-shadow:
            7px 7px 16px rgba(167, 177, 195, 0.27),
            -7px -7px 16px rgba(255, 255, 255, 0.88);
          cursor: pointer;
          text-align: left;
          transition:
            transform 160ms ease,
            box-shadow 160ms ease,
            color 160ms ease,
            border-color 160ms ease;
        }
        .customize-tab-button:hover {
          transform: translateY(-2px);
          color: var(--customize-text);
        }
        .customize-tab-button.is-active {
          color: var(--customize-accent);
          border-color: var(--customize-border);
          background:
            linear-gradient(
              145deg,
              #f8faff,
              #e7ecf5
            );
          box-shadow:
            inset 4px 4px 10px rgba(178, 188, 205, 0.3),
            inset -4px -4px 10px rgba(255, 255, 255, 0.92);
        }
        .customize-tab-button .material-symbols-rounded,
        .customize-tab-button .material-icons {
          font-size: 25px;
        }
        .customize-tab-copy {
          display: grid;
          gap: 3px;
        }
        .customize-tab-copy strong {
          font-size: 0.92rem;
          color: inherit;
        }
        .customize-tab-copy small {
          color: var(--customize-muted);
          font-size: 0.7rem;
          line-height: 1.35;
        }
        .customize-general-grid {
          display: grid;
          grid-template-columns:
            minmax(230px, 0.72fr)
            minmax(0, 1.8fr);
          gap: 20px;
        }
        .customize-neumorphic-panel {
          padding: 24px;
          border: 1px solid rgba(255, 255, 255, 0.82);
          border-radius: 24px;
          background: var(--customize-surface);
          box-shadow:
            12px 12px 30px rgba(153, 164, 183, 0.22),
            -10px -10px 26px rgba(255, 255, 255, 0.82);
          backdrop-filter: blur(18px);
        }
        .customize-eyebrow {
          display: block;
          margin-bottom: 7px;
          color: var(--customize-accent);
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .customize-neumorphic-panel h2 {
          margin: 0;
          color: var(--customize-text);
          font-size: 1.24rem;
        }
        .customize-neumorphic-panel > p,
        .customize-pending-panel p {
          color: var(--customize-muted);
          line-height: 1.65;
        }
        .customize-summary-list {
          display: grid;
          gap: 10px;
          margin-top: 20px;
        }
        .customize-summary-item {
          display: grid;
          gap: 4px;
          padding: 13px 15px;
          border-radius: 16px;
          background: #eef3f8;
          box-shadow:
            inset 3px 3px 8px rgba(174, 185, 202, 0.25),
            inset -3px -3px 8px rgba(255, 255, 255, 0.9);
        }
        .customize-summary-item span {
          color: var(--customize-muted);
          font-size: 0.72rem;
        }
        .customize-summary-item strong,
        .customize-summary-item code {
          color: var(--customize-text);
          overflow-wrap: anywhere;
        }
        .customize-form {
          display: grid;
          gap: 18px;
          margin-top: 22px;
        }
        .customize-form-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        .customize-field {
          display: grid;
          gap: 8px;
        }
        .customize-field span {
          color: #4e586d;
          font-size: 0.79rem;
          font-weight: 700;
        }
        .customize-field input,
        .customize-field textarea,
        .customize-field select {
          width: 100%;
          min-height: 46px;
          padding: 11px 14px;
          border: 1px solid rgba(107, 118, 141, 0.12);
          border-radius: 15px;
          outline: none;
          color: var(--customize-text);
          background: #eef3f8;
          box-shadow:
            inset 4px 4px 10px rgba(174, 185, 202, 0.24),
            inset -4px -4px 10px rgba(255, 255, 255, 0.92);
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease;
        }
        .customize-field textarea {
          min-height: 96px;
          resize: vertical;
        }
        .customize-field input:focus,
        .customize-field textarea:focus,
        .customize-field select:focus {
          border-color: rgba(111, 92, 245, 0.45);
          box-shadow:
            inset 3px 3px 8px rgba(174, 185, 202, 0.22),
            inset -3px -3px 8px rgba(255, 255, 255, 0.95),
            0 0 0 4px rgba(111, 92, 245, 0.09);
        }
        .customize-field input:disabled,
        .customize-field textarea:disabled,
        .customize-field select:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }
        .customize-form-note {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          padding: 14px 16px;
          border-radius: 16px;
          color: #5e6677;
          background: rgba(111, 92, 245, 0.07);
        }
        .customize-save-button {
          display: inline-flex;
          width: fit-content;
          min-height: 46px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 20px;
          border: 0;
          border-radius: 15px;
          color: white;
          background:
            linear-gradient(
              135deg,
              #7664f6,
              #5b48de
            );
          box-shadow:
            8px 8px 18px rgba(99, 80, 220, 0.24),
            -5px -5px 14px rgba(255, 255, 255, 0.8);
          cursor: pointer;
          font-weight: 800;
        }
        .customize-save-button:disabled {
          cursor: wait;
          opacity: 0.62;
        }
        .customize-pending-panel {
          display: flex;
          min-height: 280px;
          align-items: center;
          justify-content: center;
          gap: 22px;
        }
        .customize-pending-icon {
          display: grid;
          width: 78px;
          height: 78px;
          flex: 0 0 auto;
          place-items: center;
          border-radius: 22px;
          color: var(--customize-accent);
          background: #edf2f8;
          box-shadow:
            8px 8px 18px rgba(166, 177, 195, 0.28),
            -8px -8px 18px rgba(255, 255, 255, 0.9);
        }
        .customize-pending-icon .material-symbols-rounded,
        .customize-pending-icon .material-icons {
          font-size: 34px;
        }
        .customize-status-pill {
          display: inline-flex;
          margin-top: 7px;
          padding: 7px 11px;
          border-radius: 999px;
          color: #725ff0;
          background: rgba(111, 92, 245, 0.09);
          font-size: 0.72rem;
          font-weight: 800;
        }
        @media (max-width: 1050px) {
          .customize-tab-navigation {
            grid-template-columns:
              repeat(3, minmax(0, 1fr));
          }
          .customize-general-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 680px) {
          .customize-shell {
            padding: 14px;
            border-radius: 20px;
          }
          .customize-tab-navigation {
            grid-template-columns: 1fr 1fr;
          }
          .customize-tab-button {
            min-height: 72px;
          }
          .customize-tab-copy small {
            display: none;
          }
          .customize-form-grid {
            grid-template-columns: 1fr;
          }
          .customize-pending-panel {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}),(0,w.jsx)(v,{description:(0,w.jsxs)(w.Fragment,{children:[`Configure branding and platform behavior for`,` `,(0,w.jsx)(`strong`,{children:t.companyName}),`.`]}),eyebrow:`Super Admin Configuration`,icon:`tune`,stats:[{label:`Access`,value:f?`Platform Admin`:d?g(d):`User`},{label:`Currency`,value:t.customization?.defaultCurrency??`Not configured`},{label:`Timezone`,value:t.customization?.defaultTimezone??`Not configured`}],title:`Customize`}),(0,w.jsx)(_,{error:c??t.error,message:o}),(0,w.jsxs)(`div`,{className:`customize-shell`,children:[(0,w.jsx)(`nav`,{"aria-label":`Customize sections`,className:`customize-tab-navigation`,children:we.map(e=>(0,w.jsxs)(`button`,{className:r===e.id?`customize-tab-button is-active`:`customize-tab-button`,onClick:()=>{a(e.id),s(null),l(null)},type:`button`,children:[(0,w.jsx)(i,{name:e.icon}),(0,w.jsxs)(`span`,{className:`customize-tab-copy`,children:[(0,w.jsx)(`strong`,{children:e.label}),(0,w.jsx)(`small`,{children:e.description})]})]},e.id))}),r===`general`&&(0,w.jsxs)(`div`,{className:`customize-general-grid`,children:[(0,w.jsxs)(`section`,{className:`customize-neumorphic-panel`,children:[(0,w.jsx)(`span`,{className:`customize-eyebrow`,children:`Workspace identity`}),(0,w.jsx)(`h2`,{children:`General overview`}),(0,w.jsx)(`p`,{children:`These defaults control supported interfaces, reporting context, and company-facing communication.`}),(0,w.jsxs)(`div`,{className:`customize-summary-list`,children:[(0,w.jsxs)(`div`,{className:`customize-summary-item`,children:[(0,w.jsx)(`span`,{children:`Signed-in email`}),(0,w.jsx)(`strong`,{children:e.user?.email??`Not available`})]}),(0,w.jsxs)(`div`,{className:`customize-summary-item`,children:[(0,w.jsx)(`span`,{children:`Platform role`}),(0,w.jsx)(`strong`,{children:f?g(f):`None`})]}),(0,w.jsxs)(`div`,{className:`customize-summary-item`,children:[(0,w.jsx)(`span`,{children:`Company role`}),(0,w.jsx)(`strong`,{children:d?g(d):`Platform context`})]}),(0,w.jsxs)(`div`,{className:`customize-summary-item`,children:[(0,w.jsx)(`span`,{children:`Selected company`}),(0,w.jsx)(`strong`,{children:t.companyName})]})]}),(0,w.jsxs)(`p`,{className:`customize-form-note`,children:[(0,w.jsx)(i,{name:`shield_lock`}),`Authentication, passwords, and sessions remain managed by Supabase Auth.`]})]}),(0,w.jsxs)(`section`,{className:`customize-neumorphic-panel`,children:[(0,w.jsx)(`span`,{className:`customize-eyebrow`,children:`General`}),(0,w.jsx)(`h2`,{children:`Brand and operational defaults`}),(0,w.jsx)(`p`,{children:`Configure the primary identity, currency, timezone, and support details for this company.`}),(0,w.jsxs)(`form`,{className:`customize-form`,onSubmit:e=>void u(e),children:[(0,w.jsxs)(`div`,{className:`customize-form-grid`,children:[(0,w.jsxs)(`label`,{className:`customize-field`,children:[(0,w.jsx)(`span`,{children:`Brand name`}),(0,w.jsx)(`input`,{defaultValue:t.customization?.brandName??``,disabled:!t.permissions.canCustomize,name:`brandName`,placeholder:`Publisher Tracker`})]}),(0,w.jsxs)(`label`,{className:`customize-field`,children:[(0,w.jsx)(`span`,{children:`Default currency`}),(0,w.jsx)(`input`,{defaultValue:t.customization?.defaultCurrency??``,disabled:!t.permissions.canCustomize,maxLength:3,name:`defaultCurrency`,placeholder:`USD`})]})]}),(0,w.jsxs)(`label`,{className:`customize-field`,children:[(0,w.jsx)(`span`,{children:`Tagline`}),(0,w.jsx)(`textarea`,{defaultValue:t.customization?.tagline??``,disabled:!t.permissions.canCustomize,maxLength:240,name:`tagline`,placeholder:`Track smarter. Grow faster.`})]}),(0,w.jsxs)(`div`,{className:`customize-form-grid`,children:[(0,w.jsxs)(`label`,{className:`customize-field`,children:[(0,w.jsx)(`span`,{children:`Default timezone`}),(0,w.jsx)(`input`,{defaultValue:t.customization?.defaultTimezone??``,disabled:!t.permissions.canCustomize,name:`defaultTimezone`,placeholder:`Asia/Karachi`})]}),(0,w.jsxs)(`label`,{className:`customize-field`,children:[(0,w.jsx)(`span`,{children:`Support email`}),(0,w.jsx)(`input`,{defaultValue:t.customization?.supportEmail??``,disabled:!t.permissions.canCustomize,name:`supportEmail`,placeholder:`support@example.com`,type:`email`})]})]}),(0,w.jsxs)(`label`,{className:`customize-field`,children:[(0,w.jsx)(`span`,{children:`Logo URL`}),(0,w.jsx)(`input`,{defaultValue:t.customization?.logoUrl??``,disabled:!t.permissions.canCustomize,name:`logoUrl`,placeholder:`https://cdn.example.com/logo.svg`,type:`url`})]}),(0,w.jsxs)(`div`,{className:`customize-form-grid`,children:[(0,w.jsxs)(`label`,{className:`customize-field`,children:[(0,w.jsx)(`span`,{children:`Primary color`}),(0,w.jsx)(`input`,{defaultValue:t.customization?.primaryColor??``,disabled:!t.permissions.canCustomize,name:`primaryColor`,placeholder:`#8B5CF6`})]}),(0,w.jsxs)(`label`,{className:`customize-field`,children:[(0,w.jsx)(`span`,{children:`Secondary color`}),(0,w.jsx)(`input`,{defaultValue:t.customization?.secondaryColor??``,disabled:!t.permissions.canCustomize,name:`secondaryColor`,placeholder:`#F59E0B`})]})]}),t.permissions.canCustomize?(0,w.jsxs)(`button`,{className:`customize-save-button`,disabled:t.isMutating,type:`submit`,children:[(0,w.jsx)(i,{name:`save`}),t.isMutating?`Saving...`:`Save general settings`]}):(0,w.jsxs)(`p`,{className:`customize-form-note`,children:[(0,w.jsx)(i,{name:`lock`}),`Authorized company access is required to edit these values.`]})]},p)]})]}),r===`domain`&&(0,w.jsx)(j,{embedded:!0}),r===`link`&&(0,w.jsx)(R,{}),r===`proxy`&&(0,w.jsx)(de,{}),r===`smtp`&&(0,w.jsx)(Ce,{})]})]})}export{Te as SettingsPage};