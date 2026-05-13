export default function PageHero({ badge, title, subtitle, actions, style, children }) {
  return (
    <section className="home-hero" style={style}>
      <div style={{flex:1}}>
        {badge && <p className="home-kicker">{badge}</p>}
        <h1 className="home-title">{title}</h1>
        {subtitle && <p className="home-sub">{subtitle}</p>}
        {children}
      </div>
      {actions}
    </section>
  );
}
