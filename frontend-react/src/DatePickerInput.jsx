import { useEffect, useMemo, useRef, useState } from "react";

const MONTHS = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const [y, m, d] = String(value).split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return Number.isNaN(dt.getTime())  null : dt;
}

function parseBrDate(value) {
  if (!value || !/^\d{2}\/\d{2}\/\d{4}$/.test(String(value))) return null;
  const [d, m, y] = String(value).split("/").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function formatDisplay(value) {
  const dt = parseIsoDate(value);
  if (!dt) return "";
  return dt.toLocaleDateString("pt-BR");
}

function formatInputDate(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function inRange(iso, min, max) {
  if (!iso) return false;
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

function buildCalendarCells(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekdayMondayBased = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - firstWeekdayMondayBased);

  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    cells.push({
      date,
      iso: toIsoDate(date),
      isCurrentMonth: date.getMonth() === month,
    });
  }
  return cells;
}

export function DatePickerInput({
  value,
  onChange,
  min,
  max,
  disabled,
  placeholder = "dd/mm/aaaa",
  style,
  id,
  name,
}) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => parseIsoDate(value) || new Date());
  const [inputValue, setInputValue] = useState(() => formatDisplay(value || ""));

  const selectedIso = value || "";
  const selectedDate = useMemo(() => parseIsoDate(selectedIso), [selectedIso]);

  useEffect(() => {
    setInputValue(formatDisplay(selectedIso));
    if (selectedDate) {
      setViewDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [selectedIso, selectedDate]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const calendarCells = useMemo(() => buildCalendarCells(viewDate), [viewDate]);

  function emit(nextValue) {
    if (typeof onChange !== "function") return;
    onChange({ target: { value: nextValue }, currentTarget: { value: nextValue } });
  }

  function selectDate(iso) {
    if (!inRange(iso, min, max)) return;
    emit(iso);
    setOpen(false);
  }

  function clearDate() {
    emit("");
    setInputValue("");
    setOpen(false);
  }

  function commitTypedDate(rawText) {
    const parsedBr = parseBrDate(rawText);
    if (!parsedBr) {
      if (!rawText.trim()) emit("");
      return;
    }
    const iso = toIsoDate(parsedBr);
    if (!inRange(iso, min, max)) return;
    emit(iso);
    setViewDate(new Date(parsedBr.getFullYear(), parsedBr.getMonth(), 1));
  }

  const todayIso = toIsoDate(new Date());
  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();
  const minYear = min  Number(String(min).slice(0, 4)) : currentYear - 120;
  const maxYear = max  Number(String(max).slice(0, 4)) : currentYear + 40;
  const yearStart = Math.max(minYear, currentYear - 30);
  const yearEnd = Math.min(maxYear, currentYear + 30);
  const yearOptions = [];
  for (let y = yearStart; y <= yearEnd; y += 1) yearOptions.push(y);

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%" }}>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          name={name}
          value={inputValue}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            const next = formatInputDate(e.target.value);
            setInputValue(next);
            if (next.length === 10) commitTypedDate(next);
            if (!next) emit("");
          }}
          onBlur={() => {
            if (inputValue.length === 10) commitTypedDate(inputValue);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitTypedDate(inputValue);
              setOpen(false);
            }
          }}
          style={{
            width: "100%",
            minHeight: 38,
            borderRadius: 12,
            border: "1px solid var(--border, #d8dee8)",
            background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
            boxShadow: open  "0 0 0 3px rgba(13,148,136,.12)" : "0 1px 2px rgba(2,6,23,.05)",
            color: "var(--text-1, #0f172a)",
            padding: "0.55rem 2.5rem 0.55rem 0.75rem",
            fontSize: ".84rem",
            opacity: disabled  0.6 : 1,
            ...style,
          }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((s) => !s)}
          aria-label="Abrir calendario"
          style={{
            position: "absolute",
            right: 6,
            top: 4,
            width: 30,
            height: 30,
            border: "none",
            borderRadius: 9,
            background: open  "#e6fffb" : "transparent",
            color: "#0f766e",
            cursor: disabled  "not-allowed" : "pointer",
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 3v3M17 3v3M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <input type="hidden" value={selectedIso} readOnly />

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          left: 0,
          zIndex: 3200,
          width: 340,
          maxWidth: "min(95vw, 340px)",
          borderRadius: 16,
          border: "1px solid rgba(148,163,184,.35)",
          background: "#fff",
          boxShadow: "0 18px 50px rgba(15,23,42,.24)",
          overflow: "hidden",
        }}>
          <div style={{
            padding: ".62rem .75rem",
            background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
            color: "#fff",
            display: "grid",
            gridTemplateColumns: "auto 1fr 1fr auto",
            gap: ".4rem",
            alignItems: "center",
          }}>
            <button type="button" onClick={() => setViewDate(new Date(currentYear - 1, currentMonth, 1))}
              style={{ border: "none", background: "rgba(255,255,255,.18)", color: "#fff", width: 30, height: 30, borderRadius: 9, cursor: "pointer", fontWeight: 700 }}>
              «
            </button>
            <select value={currentMonth} onChange={(e) => setViewDate(new Date(currentYear, Number(e.target.value), 1))}
              style={{ height: 30, borderRadius: 9, border: "none", padding: "0 .5rem", fontSize: ".8rem", fontWeight: 700 }}>
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select value={currentYear} onChange={(e) => setViewDate(new Date(Number(e.target.value), currentMonth, 1))}
              style={{ height: 30, borderRadius: 9, border: "none", padding: "0 .5rem", fontSize: ".8rem", fontWeight: 700 }}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" onClick={() => setViewDate(new Date(currentYear + 1, currentMonth, 1))}
              style={{ border: "none", background: "rgba(255,255,255,.18)", color: "#fff", width: 30, height: 30, borderRadius: 9, cursor: "pointer", fontWeight: 700 }}>
              »
            </button>
          </div>

          <div style={{ padding: ".6rem .65rem .72rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"].map((label) => (
                <div key={label} style={{ textAlign: "center", fontSize: ".68rem", fontWeight: 700, color: "#64748b", padding: ".3rem 0" }}>{label}</div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {calendarCells.map((cell) => {
                const isSelected = selectedIso === cell.iso;
                const isToday = cell.iso === todayIso;
                const disabledCell = !inRange(cell.iso, min, max);
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => selectDate(cell.iso)}
                    disabled={disabledCell}
                    style={{
                      border: isSelected  "none" : `1px solid ${isToday  "#99f6e4" : "transparent"}`,
                      borderRadius: 10,
                      height: 34,
                      fontSize: ".78rem",
                      fontWeight: isSelected  800 : 600,
                      background: isSelected  "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)" : "transparent",
                      color: isSelected  "#fff" : (cell.isCurrentMonth  "#0f172a" : "#94a3b8"),
                      cursor: disabledCell  "not-allowed" : "pointer",
                      opacity: disabledCell  0.28 : 1,
                    }}>
                    {cell.date.getDate()}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: ".45rem", marginTop: ".65rem" }}>
              <button type="button" onClick={() => selectDate(todayIso)} style={{
                flex: 1,
                border: "1px solid #99f6e4",
                background: "#f0fdfa",
                color: "#0f766e",
                borderRadius: 10,
                padding: ".45rem .55rem",
                fontSize: ".74rem",
                fontWeight: 700,
                cursor: "pointer",
              }}>
                Hoje
              </button>
              <button type="button" onClick={clearDate} style={{
                flex: 1,
                border: "1px solid #e2e8f0",
                background: "#fff",
                color: "#64748b",
                borderRadius: 10,
                padding: ".45rem .55rem",
                fontSize: ".74rem",
                fontWeight: 700,
                cursor: "pointer",
              }}>
                Limpar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
