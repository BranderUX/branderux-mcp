import { useState, useEffect } from "react";
import { Box, ButtonBase, Checkbox, InputBase, Typography } from "@mui/material";

type Service = { id?: string; _id?: string; name: string; category?: string; price: number; durationMinutes: number; popular?: boolean };
type Barber = { id?: string; _id?: string; name: string; title?: string; daysAvailable?: string };

export interface Props {
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  consentLabel?: string;
  currencySymbol?: string;
  serviceOptions: Service[];
  barberOptions?: Barber[];
  initialService?: string;
  initialBarber?: string;
  initialDate?: string;
  initialTime?: string;
  initialValues?: { customerName?: string; phone?: string; email?: string; notes?: string };
  onSubmitBooking?: (payload: Record<string, string | number>) => void;
}

const CAPS = { fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase" as const, fontWeight: 600 };
const BRASS = "rgba(201,151,63,0.35)";
const MONO = { fontFamily: "'SF Mono', Menlo, Consolas, monospace", fontFeatureSettings: "'tnum'" };

export default function Component({ title, subtitle, submitLabel, consentLabel, currencySymbol, serviceOptions, barberOptions, initialService, initialBarber, initialDate, initialTime, initialValues, onSubmitBooking }: Props) {
  const sign = currencySymbol || "$";
  const services = serviceOptions || [];
  const barbers = barberOptions || [];
  const seed = initialValues || {};
  const [serviceName, setServiceName] = useState(initialService || "");
  const [barberName, setBarberName] = useState(initialBarber || "Any barber");
  const [date, setDate] = useState(initialDate || "");
  const [time, setTime] = useState(initialTime || "");
  const [values, setValues] = useState({ customerName: seed.customerName || "", phone: seed.phone || "", email: seed.email || "", notes: seed.notes || "" });
  const [consent, setConsent] = useState(false);
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (initialService) setServiceName(initialService);
  }, [initialService]);
  useEffect(() => {
    if (initialBarber) setBarberName(initialBarber);
  }, [initialBarber]);
  useEffect(() => {
    if (initialDate) setDate(initialDate);
    if (initialTime) setTime(initialTime);
  }, [initialDate, initialTime]);
  const seedKey = JSON.stringify(initialValues || {});
  useEffect(() => {
    const next = JSON.parse(seedKey) as Record<string, string>;
    setValues((current) => {
      const merged = { ...current };
      (Object.keys(merged) as (keyof typeof merged)[]).forEach((field) => {
        if (next[field]) merged[field] = next[field];
      });
      return merged;
    });
  }, [seedKey]);

  const chosen = services.find((service) => service.name === serviceName);
  const missing: string[] = [];
  if (!chosen) missing.push("a service");
  if (!date) missing.push("a day");
  if (!time) missing.push("a time");
  if (values.customerName.trim().length < 2) missing.push("your name");
  if (values.phone.trim().length < 6) missing.push("a phone number");
  const ready = missing.length === 0;

  const submit = () => {
    setAttempted(true);
    if (!ready || !chosen) return;
    onSubmitBooking?.({ customerName: values.customerName.trim(), phone: values.phone.trim(), email: values.email.trim() || "not provided", serviceName: chosen.name, barberName, preferredDate: date, preferredTime: time, estimatedPrice: chosen.price, notes: values.notes.trim() || "none", marketingConsent: consent ? "yes" : "no" });
  };

  const step = (index: number, label: string, done: boolean) => (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.25 }}>
      <Box sx={{ width: 26, height: 26, borderRadius: "50%", border: "1px solid", borderColor: "primary.main", bgcolor: done ? "primary.main" : "transparent", color: done ? "#131110" : "primary.main", display: "flex", alignItems: "center", justifyContent: "center", ...MONO, fontSize: 12, fontWeight: 700 }} aria-hidden="true">{index}</Box>
      <Typography sx={{ ...CAPS, color: "text.primary" }}>{label}</Typography>
      <Box sx={{ flexGrow: 1, borderBottom: "1px solid", borderColor: BRASS }} />
    </Box>
  );

  const chip = (label: string, sub: string, on: boolean, onClick: () => void) => (
    <ButtonBase onClick={onClick} aria-pressed={on} sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0.2, px: 1.5, py: 1, border: "1px solid", borderColor: on ? "primary.main" : BRASS, bgcolor: on ? "primary.main" : "transparent", color: on ? "#131110" : "text.primary", textAlign: "start", "&:focus-visible": { outline: "2px solid", outlineColor: "secondary.main", outlineOffset: 2 } }}>
      <Typography sx={{ fontSize: "0.98rem", fontWeight: 600, lineHeight: 1.1, color: "inherit" }}>{label}</Typography>
      {sub && <Typography sx={{ ...MONO, fontSize: 11, color: "inherit", opacity: 0.8 }}>{sub}</Typography>}
    </ButtonBase>
  );

  const field = (label: string, key: keyof typeof values, invalid: boolean, extra?: Record<string, unknown>) => (
    <Box sx={{ borderBottom: "1px solid", borderColor: attempted && invalid ? "accent.main" : BRASS, pb: 0.5 }}>
      <Typography component="label" htmlFor={"bk-" + key} sx={{ ...CAPS, fontSize: 10, display: "block", color: attempted && invalid ? "accent.main" : "text.secondary", mb: 0.25 }}>{label}</Typography>
      <InputBase id={"bk-" + key} fullWidth value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} inputProps={extra} sx={{ fontSize: "1.05rem", color: "text.primary", "& input, & textarea": { p: 0 } }} />
    </Box>
  );

  return (
    <Box sx={{ px: { xs: 2.5, sm: 4 }, py: { xs: 3, sm: 4 }, maxWidth: 680, mx: "auto", width: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Typography variant="h3" component="h2" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1, fontSize: { xs: "2.2rem", sm: "2.8rem" }, color: "text.primary" }}>{title || "Request an appointment"}</Typography>
        {subtitle && <Typography sx={{ mt: 1, fontSize: "0.95rem", color: "text.secondary", fontStyle: "italic" }}>{subtitle}</Typography>}
      </Box>

      <Box>
        {step(1, "Service", Boolean(chosen))}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }} role="group" aria-label="Service">
          {services.map((service) => chip(service.name, service.durationMinutes + " min · " + sign + service.price, service.name === serviceName, () => setServiceName(service.name)))}
        </Box>
      </Box>

      {barbers.length > 0 && (
        <Box>
          {step(2, "Barber", true)}
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }} role="group" aria-label="Barber">
            {chip("Any barber", "first free chair", barberName === "Any barber", () => setBarberName("Any barber"))}
            {barbers.map((barber) => chip(barber.name, barber.daysAvailable || barber.title || "", barber.name === barberName, () => setBarberName(barber.name)))}
          </Box>
        </Box>
      )}

      <Box>
        {step(3, "When", Boolean(date && time))}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <Box sx={{ borderBottom: "1px solid", borderColor: attempted && !date ? "accent.main" : BRASS, pb: 0.5 }}>
            <Typography component="label" htmlFor="bk-date" sx={{ ...CAPS, fontSize: 10, display: "block", color: "text.secondary", mb: 0.25 }}>Day</Typography>
            <InputBase id="bk-date" fullWidth type="date" value={date} onChange={(event) => setDate(event.target.value)} sx={{ fontSize: "1.05rem", color: "text.primary", colorScheme: "dark", "& input": { p: 0 } }} />
          </Box>
          <Box sx={{ borderBottom: "1px solid", borderColor: attempted && !time ? "accent.main" : BRASS, pb: 0.5 }}>
            <Typography component="label" htmlFor="bk-time" sx={{ ...CAPS, fontSize: 10, display: "block", color: "text.secondary", mb: 0.25 }}>Time</Typography>
            <InputBase id="bk-time" fullWidth type="time" value={time} onChange={(event) => setTime(event.target.value)} sx={{ fontSize: "1.05rem", color: "text.primary", colorScheme: "dark", "& input": { p: 0 } }} />
          </Box>
        </Box>
      </Box>

      <Box>
        {step(4, "You", values.customerName.trim().length >= 2 && values.phone.trim().length >= 6)}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          {field("Name", "customerName", values.customerName.trim().length < 2)}
          {field("Phone", "phone", values.phone.trim().length < 6, { inputMode: "tel" })}
          <Box sx={{ gridColumn: { xs: "auto", sm: "1 / -1" } }}>{field("Email (optional)", "email", false, { inputMode: "email" })}</Box>
          <Box sx={{ gridColumn: "1 / -1" }}>{field("Notes for the barber", "notes", false, { maxLength: 300 })}</Box>
        </Box>
      </Box>

      <Box component="label" sx={{ display: "flex", alignItems: "flex-start", gap: 1, cursor: "pointer" }}>
        <Checkbox checked={consent} onChange={(event) => setConsent(event.target.checked)} size="small" sx={{ p: 0.5, mt: -0.25, color: "primary.main" }} />
        <Typography sx={{ fontSize: "0.9rem", color: "text.secondary", lineHeight: 1.5 }}>{consentLabel || "Happy to get news and offers by text or email"}</Typography>
      </Box>

      <Box sx={{ border: "1px solid", borderColor: BRASS, p: 2, display: "flex", alignItems: "center", gap: 2, bgcolor: "rgba(255,255,255,0.03)" }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography sx={{ ...CAPS, fontSize: 10, color: "primary.main" }}>Your request</Typography>
          <Typography sx={{ fontSize: "1rem", color: "text.primary", mt: 0.25 }}>{[chosen ? chosen.name : "Pick a service", barberName, date && time ? date + " " + time : "day and time"].join(" · ")}</Typography>
        </Box>
        <Box sx={{ textAlign: "end", flexShrink: 0 }}>
          <Typography sx={{ ...MONO, fontSize: "1.4rem", color: "text.primary", lineHeight: 1 }}>{chosen ? sign + chosen.price : "–"}</Typography>
          <Typography sx={{ ...MONO, fontSize: 11, color: "text.secondary" }}>{chosen ? chosen.durationMinutes + " min" : ""}</Typography>
        </Box>
      </Box>

      <ButtonBase onClick={submit} sx={{ ...CAPS, fontSize: 12, width: "100%", py: 1.9, bgcolor: "primary.main", color: "#131110", "&:hover": { bgcolor: "#E0B45E" }, "&:focus-visible": { outline: "2px solid", outlineColor: "secondary.main", outlineOffset: 2 } }}>
        {submitLabel || "Send request"}
      </ButtonBase>
      {attempted && !ready && <Typography sx={{ color: "accent.main", fontSize: "0.95rem" }} aria-live="polite">{"Still missing: " + missing.join(", ")}</Typography>}
    </Box>
  );
}
