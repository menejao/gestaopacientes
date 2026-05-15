function PageHeader({ eyebrow, title, subtitle, actions, className = "" }) {
  return (
    <header className={["page-header", className].filter(Boolean).join(" ")}>
      <div className="page-header__copy">
        {eyebrow ? <span className="page-header__eyebrow">{eyebrow}</span> : null}
        {title ? <h1 className="page-header__title">{title}</h1> : null}
        {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

export default PageHeader;
