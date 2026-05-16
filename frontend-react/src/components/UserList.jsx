import PageHero from "./layout/PageHero";
import EmptyState from "./ui/EmptyState";
import Avatar from "./ui/Avatar";

function UserList({ title, users, isManagerUser, onEdit, onDelete }) {
  return (
    <div className="page-layout">
      <PageHero
        badge="Gestão da Equipe"
        title={title}
        subtitle={`${users.length} membro${users.length !== 1 ? "s" : ""} cadastrado${users.length !== 1 ? "s" : ""}`}
      />
      <div className="card card--noPad">
        {!users.length
          ? <EmptyState title={`Nenhum ${title.toLowerCase()} cadastrado.`} />
          : <ul className="stack-list stack-list--padded">
              {users.map(u => (
                <li key={u.id}>
                  <div className="dashboard__team-user">
                    <Avatar name={u.name} size="sm" />
                    <div>
                      <p><strong>{u.name}</strong></p>
                      <p className="muted small">{u.email}</p>
                      {u.councilNumber && <p className="muted small">CRM {u.councilNumber}/{u.councilUf}</p>}
                    </div>
                  </div>
                  {isManagerUser && (
                    <div className="actions">
                      <button className="btn btn--secondary btn--sm" onClick={() => onEdit(u)()}>Editar</button>
                      <button className="btn btn--danger btn--sm" onClick={() => onDelete(u)}>Excluir</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
        }
      </div>
    </div>
  );
}

export default UserList;
