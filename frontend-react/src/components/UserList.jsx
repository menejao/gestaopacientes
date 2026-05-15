import PageHero from "./layout/PageHero";
import EmptyState from "./ui/EmptyState";
import { initials } from "../utils/formatting";

function UserList({ title, users, isManagerUser, onEdit, onDelete }) {
  return (
    <div className="workspace-home">
      <PageHero badge="Gestão da Equipe" title={title} subtitle={`${users.length} membro${users.length!==1?"s":""} cadastrado${users.length!==1?"s":""}`} />
      <div className="card">
        {!users.length
          ? <EmptyState message={`Nenhum ${title.toLowerCase()} cadastrado.`}/>
          : <ul className="stack-list" style={{padding:"0 1.25rem"}}>
              {users.map(u=>(
                <li key={u.id}>
                  <div style={{display:"flex",alignItems:"center",gap:".6rem"}}>
                    <div className="user-avatar" style={{width:32,height:32,fontSize:".8rem",flexShrink:0}}>{initials(u.name)}</div>
                    <div>
                      <p><strong>{u.name}</strong></p>
                      <p className="muted small">{u.email}</p>
                      {u.councilNumber&&<p className="muted small">CRM {u.councilNumber}/{u.councilUf}</p>}
                    </div>
                  </div>
                  {isManagerUser&&(
                    <div className="actions">
                      <button className="secondary" style={{padding:".3rem .7rem",fontSize:".75rem"}} onClick={()=>onEdit(u)()}>Editar</button>
                      <button className="danger-btn" style={{padding:".3rem .7rem",fontSize:".75rem"}} onClick={()=>onDelete(u)}>Excluir</button>
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
