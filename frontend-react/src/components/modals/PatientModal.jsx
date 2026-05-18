import { useState } from "react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";

const TABS = [
  { id: "identity", label: "Identificação" },
  { id: "contact",  label: "Contato e Endereço" },
  { id: "clinical", label: "Dados Clínicos" },
  { id: "social",   label: "Dados Sociais" },
];

const CHRONIC_CONDITIONS = [
  { value: "diabetes",        label: "Diabetes" },
  { value: "hypertension",    label: "Hipertensão" },
  { value: "asthma",          label: "Asma" },
  { value: "copd",            label: "DPOC" },
  { value: "obesity",         label: "Obesidade" },
  { value: "heart_disease",   label: "Cardiopatia" },
  { value: "renal_disease",   label: "D. Renal" },
  { value: "stroke",          label: "AVC/Sequela" },
  { value: "tuberculosis",    label: "Tuberculose" },
  { value: "hanseniasis",     label: "Hanseníase" },
  { value: "mental_disorder", label: "Transtorno Mental" },
];

function ChronicPills({ values = [], onChange, readOnly }) {
  function toggle(v) {
    if (readOnly || !onChange) return;
    onChange(values.includes(v) ? values.filter((c) => c !== v) : [...values, v]);
  }
  return (
    <div className="chronic-pills">
      {CHRONIC_CONDITIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`chronic-pill${values.includes(value) ? " is-active" : ""}`}
          onClick={() => toggle(value)}
          disabled={readOnly}
          aria-pressed={values.includes(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function lockProps(readOnly) {
  return readOnly ? { readOnly: true, disabled: true } : {};
}

function Section({ title, children }) {
  return (
    <section className="form__section">
      <header className="form__section-header"><h3>{title}</h3></header>
      <div className="field-grid">{children}</div>
    </section>
  );
}

function Field({ label, span, children }) {
  return (
    <label className={`field${span === 2 ? " field--span-2" : ""}`}>
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

export default function PatientModal({
  open,
  editingPatient,
  form,
  setForm,
  users,
  catOpts,
  isChildCategory,
  lookupCepAndFillAddress,
  formatPhone,
  formatCep,
  formatCpf,
  formatCns,
  error,
  busy,
  readOnly = false,
  onClose,
  onSubmit,
}) {
  const [activeTab, setActiveTab] = useState("identity");

  if (!open) return null;

  const title = readOnly
    ? "Visualizar paciente"
    : editingPatient
      ? "Editar paciente"
      : "Novo paciente";

  const isPregnant = String(form.careCategory || "").toLowerCase() === "pregnant";
  const isChild = isChildCategory(form.careCategory);

  function upd(field) {
    return readOnly ? undefined : (e) => setForm((s) => ({ ...s, [field]: e.target.value }));
  }

  function updUpper(field) {
    return readOnly ? undefined : (e) => setForm((s) => ({ ...s, [field]: e.target.value.toUpperCase().slice(0, 2) }));
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      className="modal--xl modal--tabbed"
      actions={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {readOnly ? "Fechar" : "Cancelar"}
          </Button>
          {!readOnly && (
            <Button type="submit" form="patient-modal-form" variant="primary" disabled={busy}>
              {busy ? "Salvando..." : "Salvar paciente"}
            </Button>
          )}
        </>
      }
    >
      <nav className="patient-modal-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`patient-modal-nav__tab${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {error && <p className="field__error patient-modal-nav__error">{error}</p>}

      <form id="patient-modal-form" className="patient-modal-form" onSubmit={onSubmit}>

        {activeTab === "identity" && (
          <>
            <Section title="Vínculo e equipe">
              <Field label="Grupo / Categoria *">
                <div className="input">
                  <select value={form.careCategory} onChange={upd("careCategory")} {...lockProps(readOnly)}>
                    {(catOpts.length ? catOpts.filter((c) => c.value !== "chronic") : [{ value: "general", label: "Geral" }]).map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </Field>
              <Field label="ACS responsável">
                <div className="input">
                  <select value={form.assignedAcsId} onChange={upd("assignedAcsId")} {...lockProps(readOnly)}>
                    <option value="">Não atribuído</option>
                    {users.filter((u) => u.role === "acs").map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </Field>
              <div className="field field--span-2">
                <span className="field__label">Condições crônicas</span>
                <ChronicPills
                  values={form.chronicConditions || []}
                  onChange={readOnly ? undefined : (next) => setForm((s) => ({ ...s, chronicConditions: next }))}
                  readOnly={readOnly}
                />
              </div>
            </Section>

            <Section title="Identificação">
              <Field label="Nome completo *" span={2}>
                <div className="input">
                  <input value={form.name} onChange={upd("name")} placeholder="Nome completo do paciente" {...lockProps(readOnly)} />
                </div>
              </Field>

              <div className="field field--span-2">
                <span className="field__label">Nome da mãe</span>
                <div className="patient-modal__inline">
                  <div className="input">
                    <input
                      value={form.motherName}
                      onChange={upd("motherName")}
                      placeholder="Nome completo da mãe"
                      disabled={readOnly || form.motherUnknown || false}
                    />
                  </div>
                  <label className="patient-modal__checkbox patient-modal__checkbox--compact">
                    <input
                      type="checkbox"
                      checked={form.motherUnknown || false}
                      onChange={readOnly ? undefined : (e) => setForm((s) => ({
                        ...s,
                        motherUnknown: e.target.checked,
                        motherName: e.target.checked ? "Desconhecida" : s.motherName === "Desconhecida" ? "" : s.motherName,
                      }))}
                      {...lockProps(readOnly)}
                    />
                    Mãe desconhecida
                  </label>
                </div>
              </div>

              {isChild && (
                <Field label="Nome do responsável" span={2}>
                  <div className="input">
                    <input value={form.guardianName || ""} onChange={upd("guardianName")} placeholder="Nome do responsável legal" {...lockProps(readOnly)} />
                  </div>
                </Field>
              )}

              <Field label="Data de nascimento">
                <div className="input"><input type="date" value={form.birthDate} onChange={upd("birthDate")} {...lockProps(readOnly)} /></div>
              </Field>
              <Field label="Sexo biológico">
                <div className="input">
                  <select value={form.sex} onChange={upd("sex")} {...lockProps(readOnly)}>
                    <option value="">Não informado</option>
                    <option value="feminino">Feminino</option>
                    <option value="masculino">Masculino</option>
                    <option value="intersexo">Intersexo</option>
                  </select>
                </div>
              </Field>
              <Field label="Raça / Cor">
                <div className="input">
                  <select value={form.raceColor} onChange={upd("raceColor")} {...lockProps(readOnly)}>
                    <option value="">Não informado</option>
                    <option value="branca">Branca</option>
                    <option value="preta">Preta</option>
                    <option value="parda">Parda</option>
                    <option value="amarela">Amarela</option>
                    <option value="indigena">Indígena</option>
                    <option value="nao_declarado">Não declarado</option>
                  </select>
                </div>
              </Field>
              {!isChild && (
                <Field label="Estado civil">
                  <div className="input">
                    <select value={form.maritalStatus} onChange={upd("maritalStatus")} {...lockProps(readOnly)}>
                      <option value="">Não informado</option>
                      <option value="solteiro">Solteiro(a)</option>
                      <option value="casado">Casado(a)</option>
                      <option value="uniao_estavel">União estável</option>
                      <option value="divorciado">Divorciado(a)</option>
                      <option value="separado">Separado(a)</option>
                      <option value="viuvo">Viúvo(a)</option>
                    </select>
                  </div>
                </Field>
              )}
              <Field label="Município de nascimento">
                <div className="input"><input value={form.birthCity} onChange={upd("birthCity")} {...lockProps(readOnly)} /></div>
              </Field>
              <Field label="UF de nascimento">
                <div className="input"><input value={form.birthState} maxLength={2} onChange={updUpper("birthState")} {...lockProps(readOnly)} /></div>
              </Field>
              <Field label="CPF">
                <div className="input">
                  <input value={form.cpf} onChange={readOnly ? undefined : (e) => setForm((s) => ({ ...s, cpf: formatCpf(e.target.value) }))} placeholder="000.000.000-00" {...lockProps(readOnly)} />
                </div>
              </Field>
              <Field label="CNS">
                <div className="input">
                  <input value={form.cns} onChange={readOnly ? undefined : (e) => setForm((s) => ({ ...s, cns: formatCns(e.target.value) }))} placeholder="000 0000 0000 0000" {...lockProps(readOnly)} />
                </div>
              </Field>
            </Section>
          </>
        )}

        {activeTab === "contact" && (
          <>
            <Section title="Contato">
              <Field label="Telefone principal *">
                <div className="input">
                  <input value={form.phone} onChange={readOnly ? undefined : (e) => setForm((s) => ({ ...s, phone: formatPhone(e.target.value) }))} {...lockProps(readOnly)} />
                </div>
              </Field>
              <Field label="Telefone alternativo">
                <div className="input">
                  <input value={form.phoneAlt} onChange={readOnly ? undefined : (e) => setForm((s) => ({ ...s, phoneAlt: formatPhone(e.target.value) }))} {...lockProps(readOnly)} />
                </div>
              </Field>
            </Section>

            <Section title="Endereço">
              <Field label="CEP">
                <div className="input">
                  <input
                    value={form.zipCode}
                    onBlur={readOnly ? undefined : lookupCepAndFillAddress}
                    onChange={readOnly ? undefined : (e) => setForm((s) => ({ ...s, zipCode: formatCep(e.target.value) }))}
                    {...lockProps(readOnly)}
                  />
                </div>
              </Field>
              <Field label="Número">
                <div className="input"><input value={form.number} onChange={upd("number")} {...lockProps(readOnly)} /></div>
              </Field>
              <Field label="Rua / Logradouro" span={2}>
                <div className="input"><input value={form.address} onChange={upd("address")} {...lockProps(readOnly)} /></div>
              </Field>
              <Field label="Complemento">
                <div className="input"><input value={form.complement} onChange={upd("complement")} {...lockProps(readOnly)} /></div>
              </Field>
              <Field label="Bairro">
                <div className="input"><input value={form.neighborhood} onChange={upd("neighborhood")} {...lockProps(readOnly)} /></div>
              </Field>
              <Field label="Cidade">
                <div className="input"><input value={form.city} onChange={upd("city")} {...lockProps(readOnly)} /></div>
              </Field>
              <Field label="Estado (UF)">
                <div className="input"><input value={form.state} maxLength={2} onChange={updUpper("state")} {...lockProps(readOnly)} /></div>
              </Field>
            </Section>
          </>
        )}

        {activeTab === "clinical" && (
          <>
            {isPregnant && (
              <Section title="Dados gestacionais">
                <Field label="DUM">
                  <div className="input"><input type="date" value={form.pregnancyStartDate} onChange={upd("pregnancyStartDate")} {...lockProps(readOnly)} /></div>
                </Field>
                <Field label="DPP">
                  <div className="input"><input type="date" value={form.expectedDeliveryDate} onChange={upd("expectedDeliveryDate")} {...lockProps(readOnly)} /></div>
                </Field>
                <Field label="IG DUM — Semanas">
                  <div className="input"><input type="number" min="0" max="45" value={form.gestationalAgeDumWeeks} onChange={upd("gestationalAgeDumWeeks")} {...lockProps(readOnly)} /></div>
                </Field>
                <Field label="IG DUM — Dias">
                  <div className="input"><input type="number" min="0" max="6" value={form.gestationalAgeDumDays} onChange={upd("gestationalAgeDumDays")} {...lockProps(readOnly)} /></div>
                </Field>
                <Field label="Data 1ª USG">
                  <div className="input"><input type="date" value={form.usgDate1} onChange={upd("usgDate1")} {...lockProps(readOnly)} /></div>
                </Field>
                <Field label="IG USG — Semanas">
                  <div className="input"><input type="number" min="0" max="45" value={form.gestationalAgeUsgWeeks} onChange={upd("gestationalAgeUsgWeeks")} {...lockProps(readOnly)} /></div>
                </Field>
                <Field label="IG USG — Dias">
                  <div className="input"><input type="number" min="0" max="6" value={form.gestationalAgeUsgDays} onChange={upd("gestationalAgeUsgDays")} {...lockProps(readOnly)} /></div>
                </Field>
                <Field label="Data 2ª USG">
                  <div className="input"><input type="date" value={form.usgDate2} onChange={upd("usgDate2")} {...lockProps(readOnly)} /></div>
                </Field>
                <Field label="Data 3ª USG">
                  <div className="input"><input type="date" value={form.usgDate3} onChange={upd("usgDate3")} {...lockProps(readOnly)} /></div>
                </Field>
              </Section>
            )}
            <Section title="Dados clínicos">
              <Field label="Alergias conhecidas" span={2}>
                <textarea className="input" value={form.allergies} onChange={upd("allergies")} rows={2} {...lockProps(readOnly)} />
              </Field>
              <Field label="Comorbidades" span={2}>
                <textarea className="input" value={form.comorbidities} onChange={upd("comorbidities")} rows={2} {...lockProps(readOnly)} />
              </Field>
              <Field label="Medicamentos em uso contínuo" span={2}>
                <textarea className="input" value={form.medications} onChange={upd("medications")} rows={2} {...lockProps(readOnly)} />
              </Field>
            </Section>
          </>
        )}

        {activeTab === "social" && (
          <>
            <Section title="Dados territoriais">
              <Field label="Microárea">
                <div className="input"><input value={form.microArea || ""} onChange={upd("microArea")} {...lockProps(readOnly)} /></div>
              </Field>
              <Field label="Código de família">
                <div className="input"><input value={form.familyCode || ""} onChange={upd("familyCode")} {...lockProps(readOnly)} /></div>
              </Field>
              <Field label="Frequência de visita ACS">
                <div className="input"><input value={form.homeVisitFreq || ""} onChange={upd("homeVisitFreq")} {...lockProps(readOnly)} /></div>
              </Field>
              <Field label="Tipo de moradia">
                <div className="input">
                  <select value={form.housingType || ""} onChange={upd("housingType")} {...lockProps(readOnly)}>
                    <option value="">Não informado</option>
                    {["Alvenaria", "Madeira", "Taipa", "Improvisada", "Outro"].map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </Field>
              <Field label="Abastecimento de água">
                <div className="input">
                  <select value={form.waterSupply || ""} onChange={upd("waterSupply")} {...lockProps(readOnly)}>
                    <option value="">Não informado</option>
                    {["Rede pública", "Poço/nascente", "Outros"].map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </Field>
              <Field label="Esgotamento sanitário">
                <div className="input">
                  <select value={form.sewage || ""} onChange={upd("sewage")} {...lockProps(readOnly)}>
                    <option value="">Não informado</option>
                    {["Rede pública", "Fossa séptica", "Fossa rudimentar", "Céu aberto", "Outro"].map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </Field>
              <Field label="Destino do lixo">
                <div className="input">
                  <select value={form.garbage || ""} onChange={upd("garbage")} {...lockProps(readOnly)}>
                    <option value="">Não informado</option>
                    {["Coletado", "Queimado", "Enterrado", "Céu aberto", "Outro"].map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </Field>
              <Field label="Energia elétrica">
                <div className="input">
                  <select value={form.electricity || ""} onChange={upd("electricity")} {...lockProps(readOnly)}>
                    <option value="">Não informado</option>
                    {["Sim", "Não", "Irregular"].map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </Field>
            </Section>

            <Section title="Informações psicossociais">
              <Field label="Escolaridade">
                <div className="input">
                  <select value={form.educationLevel || ""} onChange={upd("educationLevel")} {...lockProps(readOnly)}>
                    <option value="">Não informado</option>
                    <option value="sem_escolaridade">Sem escolaridade</option>
                    <option value="fundamental_incompleto">Fundamental incompleto</option>
                    <option value="fundamental_completo">Fundamental completo</option>
                    <option value="medio_incompleto">Médio incompleto</option>
                    <option value="medio_completo">Médio completo</option>
                    <option value="superior_incompleto">Superior incompleto</option>
                    <option value="superior_completo">Superior completo</option>
                    <option value="pos_graduacao">Pós-graduação</option>
                  </select>
                </div>
              </Field>
              <Field label="Ocupação">
                <div className="input">
                  <input value={form.occupation || ""} onChange={upd("occupation")} placeholder="Ex.: agricultor, estudante, aposentado..." {...lockProps(readOnly)} />
                </div>
              </Field>
              <Field label="Situação familiar">
                <div className="input">
                  <select value={form.familySituation || ""} onChange={upd("familySituation")} {...lockProps(readOnly)}>
                    <option value="">Não informado</option>
                    <option value="mora_sozinho">Mora sozinho</option>
                    <option value="familia_nuclear">Família nuclear</option>
                    <option value="familia_extensa">Família extensa</option>
                    <option value="unipessoal">Unipessoal</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
              </Field>
              <Field label="Apoio familiar">
                <div className="input">
                  <select value={form.familySupport || ""} onChange={upd("familySupport")} {...lockProps(readOnly)}>
                    <option value="">Não informado</option>
                    <option value="adequado">Adequado</option>
                    <option value="parcial">Parcial</option>
                    <option value="ausente">Ausente</option>
                  </select>
                </div>
              </Field>
              <Field label="Vulnerabilidade social">
                <div className="input">
                  <select value={form.socialVulnerability || ""} onChange={upd("socialVulnerability")} {...lockProps(readOnly)}>
                    <option value="">Não informado</option>
                    <option value="baixa">Baixa</option>
                    <option value="moderada">Moderada</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
              </Field>
              <Field label="Benefício social">
                <div className="input">
                  <input value={form.socialBenefit || ""} onChange={upd("socialBenefit")} placeholder="Ex.: Bolsa Família, BPC, LOAS..." {...lockProps(readOnly)} />
                </div>
              </Field>
              <Field label="Dependência química">
                <div className="input">
                  <select value={form.substanceDependency || ""} onChange={upd("substanceDependency")} {...lockProps(readOnly)}>
                    <option value="">Não informado</option>
                    <option value="nao">Não</option>
                    <option value="alcool">Álcool</option>
                    <option value="tabaco">Tabaco</option>
                    <option value="outras_drogas">Outras drogas</option>
                    <option value="multiplas">Múltiplas substâncias</option>
                  </select>
                </div>
              </Field>
              <Field label="Situação de violência">
                <div className="input">
                  <select value={form.domesticViolence || ""} onChange={upd("domesticViolence")} {...lockProps(readOnly)}>
                    <option value="">Não informado</option>
                    <option value="nao">Não</option>
                    <option value="suspeita">Suspeita</option>
                    <option value="confirmada">Confirmada</option>
                  </select>
                </div>
              </Field>
            </Section>
          </>
        )}

      </form>
    </Modal>
  );
}
