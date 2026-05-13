export function HomeHero({ kicker, title, subtitle, actions = null, children = null, sectionClassName = "" }) {
  const cls = ["home-hero", sectionClassName].filter(Boolean).join(" ");
  return (
    <section className={cls} aria-label={title || kicker || undefined}>
      <div className="hero-body">
        {kicker ? <p className="home-kicker">{kicker}</p> : null}
        {title ? <h1 className="home-title">{title}</h1> : null}
        {subtitle ? <p className="home-sub">{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className="home-hero-actions">{actions}</div> : null}
    </section>
  );
}
