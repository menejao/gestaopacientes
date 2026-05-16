export default function PageHero({ badge, title, subtitle, actions, children }) {
  return (
    <header className="page-header">
      <div className="page-header__copy">
        {badge ? <span className="page-header__eyebrow">{badge}</span> : null}
        {title ? <h1 className="page-header__title">{title}</h1> : null}
        {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
