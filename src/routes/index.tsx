import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { Check, X, Zap, TrendingUp, Leaf, Users, Download, Trash2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "EV Driver Transition Readiness Scorer | Uber Electrification" },
      { name: "description", content: "Assess driver EV readiness from real trip data with instant scoring and fleet-level CO2 insights." },
    ],
  }),
});

type Tier = "READY" | "SOON" | "NOT YET";
type Vehicle = "Petrol" | "Diesel" | "Hybrid";

interface Driver {
  id: string;
  driverId: string;
  city: string;
  cityType: string;
  avgTrip: number;
  weeklyMiles: number;
  tripsPerWeek: number;
  vehicleAge: number;
  vehicleType: Vehicle;
  tier: Tier;
  score: number;
  co2Saving: number;
  conditions: { label: string; met: boolean }[];
}

const CITIES = ["London", "Manchester", "Birmingham", "Edinburgh", "Bristol"];
const CITY_TYPES = ["Urban", "Suburban", "Rural"];
const VEHICLES: Vehicle[] = ["Petrol", "Diesel", "Hybrid"];

// Emission factors in g/mi
const EMISSION_FACTORS: Record<Vehicle, number> = {
  Petrol: 170,
  Diesel: 200,
  Hybrid: 90,
};

// Each dimension scores 0–2: 2 = READY range, 1 = SOON range, 0 = not ready
function scoreDimensions(input: Omit<Driver, "id" | "tier" | "score" | "co2Saving" | "conditions">) {
  return [
    {
      label: "Avg trip < 15 mi",
      readyLabel: "Avg trip < 15 mi",
      soonLabel: "Avg trip 15–25 mi",
      points: input.avgTrip < 15 ? 2 : input.avgTrip <= 25 ? 1 : 0,
      met: input.avgTrip < 15,
    },
    {
      label: "Urban city type",
      readyLabel: "Urban city type",
      soonLabel: "Suburban city type",
      points: input.cityType === "Urban" ? 2 : input.cityType === "Suburban" ? 1 : 0,
      met: input.cityType === "Urban",
    },
    {
      label: "Weekly miles < 200",
      readyLabel: "Weekly miles < 200",
      soonLabel: "Weekly miles 200–350",
      points: input.weeklyMiles < 200 ? 2 : input.weeklyMiles <= 350 ? 1 : 0,
      met: input.weeklyMiles < 200,
    },
    {
      label: "Vehicle age > 4 yrs",
      readyLabel: "Vehicle age > 4 yrs",
      soonLabel: "Vehicle age 2–4 yrs",
      points: input.vehicleAge > 4 ? 2 : input.vehicleAge >= 2 ? 1 : 0,
      met: input.vehicleAge > 4,
    },
    {
      label: "Trips/week > 60",
      readyLabel: "Trips/week > 60",
      soonLabel: "Trips/week 30–60",
      points: input.tripsPerWeek > 60 ? 2 : input.tripsPerWeek >= 30 ? 1 : 0,
      met: input.tripsPerWeek > 60,
    },
  ];
}

function score(input: Omit<Driver, "id" | "tier" | "score" | "co2Saving" | "conditions">) {
  const dims = scoreDimensions(input);
  const totalPoints = dims.reduce((s, d) => s + d.points, 0);
  const numericScore = Math.round((totalPoints / 10) * 100);

  let tier: Tier;
  if (numericScore >= 80) tier = "READY";
  else if (numericScore >= 40) tier = "SOON";
  else tier = "NOT YET";

  // Always show all 5 dimensions using READY criteria so the driver knows what to improve
  const conditions = dims.map((d) => ({ label: d.readyLabel, met: d.met }));

  const co2Saving = Math.round(
    (input.weeklyMiles * 52 * EMISSION_FACTORS[input.vehicleType]) / 1000
  );

  return { tier, score: numericScore, conditions, co2Saving };
}

const TIER_META: Record<Tier, { bg: string; text: string; rec: string }> = {
  READY: {
    bg: "bg-[oklch(0.72_0.18_152/0.15)] border-[oklch(0.72_0.18_152/0.4)]",
    text: "text-[oklch(0.78_0.18_152)]",
    rec: "This driver is an ideal EV candidate. Short urban trips and an ageing vehicle make this a priority transition.",
  },
  SOON: {
    bg: "bg-[oklch(0.78_0.16_75/0.12)] border-[oklch(0.78_0.16_75/0.4)]",
    text: "text-[oklch(0.84_0.16_75)]",
    rec: "This driver could transition within 6–12 months with the right incentive package.",
  },
  "NOT YET": {
    bg: "bg-[oklch(0.55_0_0/0.12)] border-[oklch(0.55_0_0/0.4)]",
    text: "text-[oklch(0.75_0_0)]",
    rec: "Long distance or rural trip patterns make EV transition premature for this driver.",
  },
};

interface FormState {
  driverId: string;
  city: string;
  cityType: string;
  avgTrip: string;
  weeklyMiles: string;
  tripsPerWeek: string;
  vehicleAge: string;
  vehicleType: Vehicle;
}

const EMPTY: FormState = {
  driverId: "",
  city: "London",
  cityType: "Urban",
  avgTrip: "",
  weeklyMiles: "",
  tripsPerWeek: "",
  vehicleAge: "",
  vehicleType: "Petrol",
};

function exportCSV(fleet: Driver[]) {
  const header = "Driver ID,City,City Type,Vehicle Type,Avg Trip (mi),Weekly Miles,Trips/Week,Vehicle Age,Tier,Score,CO2 Saved (kg/yr)";
  const rows = fleet.map((d) =>
    [d.driverId, d.city, d.cityType, d.vehicleType, d.avgTrip, d.weeklyMiles, d.tripsPerWeek, d.vehicleAge, d.tier, d.score, d.co2Saving].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ev-fleet-readiness.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function Index() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [result, setResult] = useState<Driver | null>(null);
  const [fleet, setFleet] = useState<Driver[]>([]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleAssess = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = {
      driverId: form.driverId.trim() || `D-${Math.floor(Math.random() * 9000 + 1000)}`,
      city: form.city,
      cityType: form.cityType,
      avgTrip: Number(form.avgTrip) || 0,
      weeklyMiles: Number(form.weeklyMiles) || 0,
      tripsPerWeek: Number(form.tripsPerWeek) || 0,
      vehicleAge: Number(form.vehicleAge) || 0,
      vehicleType: form.vehicleType,
    };
    const { tier, score: numericScore, conditions, co2Saving } = score(parsed);
    const driver: Driver = {
      id: crypto.randomUUID(),
      ...parsed,
      tier,
      score: numericScore,
      conditions,
      co2Saving,
    };
    setResult(driver);
  };

  const addToFleet = () => {
    if (!result) return;
    setFleet((f) => [...f, result]);
    setResult(null);
    setForm(EMPTY);
  };

  const removeFromFleet = (id: string) => setFleet((f) => f.filter((d) => d.id !== id));

  const counts = useMemo(() => {
    const c = { READY: 0, SOON: 0, "NOT YET": 0 } as Record<Tier, number>;
    fleet.forEach((d) => c[d.tier]++);
    return c;
  }, [fleet]);

  const totalCO2 = useMemo(() => fleet.reduce((s, d) => s + d.co2Saving, 0), [fleet]);
  const readyPct = fleet.length ? (counts.READY / fleet.length) * 100 : 0;

  const chartData = [
    { name: "Ready", value: counts.READY, color: "oklch(0.72 0.18 152)" },
    { name: "Soon", value: counts.SOON, color: "oklch(0.78 0.16 75)" },
    { name: "Not Yet", value: counts["NOT YET"], color: "oklch(0.55 0 0)" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-[oklch(1_0_0/0.08)]">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-[oklch(0.72_0.18_152)] flex items-center justify-center">
            <Zap className="h-5 w-5 text-black" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">EV Driver Transition Readiness Scorer</h1>
            <p className="text-xs text-[oklch(0.65_0_0)]">Uber · Electrification Team</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 grid lg:grid-cols-5 gap-6">
        {/* Form */}
        <section className="lg:col-span-3 rounded-xl border border-[oklch(1_0_0/0.08)] bg-[var(--card-bg)] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[oklch(0.65_0_0)] mb-5">
            Individual driver assessment
          </h2>
          <form onSubmit={handleAssess} className="grid sm:grid-cols-2 gap-4">
            <Field label="Driver ID">
              <input className={inputCls} value={form.driverId} onChange={(e) => update("driverId", e.target.value)} placeholder="e.g. D-1042" />
            </Field>
            <Field label="City">
              <select className={inputCls} value={form.city} onChange={(e) => update("city", e.target.value)}>
                {CITIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="City Type">
              <select className={inputCls} value={form.cityType} onChange={(e) => update("cityType", e.target.value)}>
                {CITY_TYPES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Current Vehicle Type">
              <select className={inputCls} value={form.vehicleType} onChange={(e) => update("vehicleType", e.target.value as Vehicle)}>
                {VEHICLES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Avg Trip Distance (mi)">
              <input type="number" min="0" step="0.1" required className={inputCls} value={form.avgTrip} onChange={(e) => update("avgTrip", e.target.value)} />
            </Field>
            <Field label="Weekly Miles Total">
              <input type="number" min="0" required className={inputCls} value={form.weeklyMiles} onChange={(e) => update("weeklyMiles", e.target.value)} />
            </Field>
            <Field label="Trips Per Week">
              <input type="number" min="0" required className={inputCls} value={form.tripsPerWeek} onChange={(e) => update("tripsPerWeek", e.target.value)} />
            </Field>
            <Field label="Vehicle Age (years)">
              <input type="number" min="0" required className={inputCls} value={form.vehicleAge} onChange={(e) => update("vehicleAge", e.target.value)} />
            </Field>
            <div className="sm:col-span-2 flex gap-3 pt-2">
              <button type="submit" className="flex-1 rounded-md bg-[oklch(0.72_0.18_152)] hover:bg-[oklch(0.78_0.18_152)] text-black font-semibold py-3 transition-colors">
                Assess Driver
              </button>
              <button type="button" onClick={() => { setForm(EMPTY); setResult(null); }} className="rounded-md border border-[oklch(1_0_0/0.15)] px-4 py-3 text-sm hover:bg-[oklch(1_0_0/0.05)]">
                Reset
              </button>
            </div>
          </form>

          {result && (
            <div key={result.id} className={`mt-6 rounded-lg border p-5 animate-in fade-in slide-in-from-bottom-2 duration-500 ${TIER_META[result.tier].bg}`}>
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wider text-[oklch(0.65_0_0)]">Driver {result.driverId} · {result.city}</div>
                  <div className={`mt-2 text-4xl font-bold tracking-tight ${TIER_META[result.tier].text}`}>{result.tier}</div>
                </div>
                <div className="text-right space-y-2">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[oklch(0.65_0_0)]">Readiness score</div>
                    <div className={`text-2xl font-semibold ${TIER_META[result.tier].text}`}>{result.score}<span className="text-sm font-normal text-[oklch(0.65_0_0)]">/100</span></div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[oklch(0.65_0_0)]">Est. annual CO₂ saved</div>
                    <div className="text-xl font-semibold">{result.co2Saving.toLocaleString()} <span className="text-sm font-normal text-[oklch(0.65_0_0)]">kg/yr</span></div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid sm:grid-cols-2 gap-2">
                {result.conditions.map((c) => (
                  <div key={c.label} className="flex items-center gap-2 text-sm">
                    {c.met ? (
                      <Check className="h-4 w-4 text-[oklch(0.78_0.18_152)] shrink-0" />
                    ) : (
                      <X className="h-4 w-4 text-[oklch(0.65_0.18_25)] shrink-0" />
                    )}
                    <span className={c.met ? "text-foreground" : "text-[oklch(0.6_0_0)]"}>{c.label}</span>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-sm leading-relaxed text-[oklch(0.85_0_0)]">{TIER_META[result.tier].rec}</p>

              <button onClick={addToFleet} className="mt-5 rounded-md bg-foreground/10 hover:bg-foreground/15 border border-[oklch(1_0_0/0.15)] px-4 py-2 text-sm font-medium transition-colors">
                Add to fleet →
              </button>
            </div>
          )}
        </section>

        {/* Fleet */}
        <aside className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-[oklch(1_0_0/0.08)] bg-[var(--card-bg)] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[oklch(0.65_0_0)] mb-4">Fleet overview</h2>
            <div className="grid grid-cols-3 gap-3">
              <Stat icon={<Users className="h-4 w-4" />} label="Drivers" value={fleet.length} />
              <Stat icon={<TrendingUp className="h-4 w-4" />} label="Ready %" value={`${readyPct.toFixed(0)}%`} />
              <Stat icon={<Leaf className="h-4 w-4" />} label="CO₂ kg/yr" value={totalCO2.toLocaleString()} />
            </div>

            <div className="mt-5">
              <div className="flex justify-between text-xs text-[oklch(0.65_0_0)] mb-2">
                <span>Fleet readiness</span><span>{counts.READY}/{fleet.length || 0} ready</span>
              </div>
              <div className="h-2 rounded-full bg-[oklch(1_0_0/0.08)] overflow-hidden">
                <div className="h-full bg-[oklch(0.72_0.18_152)] transition-all duration-700 ease-out" style={{ width: `${readyPct}%` }} />
              </div>
            </div>

            {fleet.length > 0 && (
              <div className="mt-5 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" stroke="oklch(0.6 0 0)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="oklch(0.6 0 0)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "oklch(1 0 0 / 0.04)" }} contentStyle={{ background: "oklch(0.18 0 0)", border: "1px solid oklch(1 0 0 / 0.1)", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {chartData.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[oklch(1_0_0/0.08)] bg-[var(--card-bg)] p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[oklch(0.65_0_0)]">Assessed drivers</h3>
              {fleet.length > 0 && (
                <button
                  onClick={() => exportCSV(fleet)}
                  className="flex items-center gap-1.5 text-xs text-[oklch(0.65_0_0)] hover:text-foreground transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </button>
              )}
            </div>
            {fleet.length === 0 ? (
              <p className="text-sm text-[oklch(0.55_0_0)] py-6 text-center">No drivers assessed yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-[oklch(0.6_0_0)]">
                      <th className="px-2 py-2 font-medium">Driver</th>
                      <th className="px-2 py-2 font-medium">City</th>
                      <th className="px-2 py-2 font-medium">Tier</th>
                      <th className="px-2 py-2 font-medium text-right">Score</th>
                      <th className="px-2 py-2 font-medium text-right">CO₂</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {fleet.map((d) => (
                      <tr key={d.id} className="border-t border-[oklch(1_0_0/0.06)] group">
                        <td className="px-2 py-2 font-medium">{d.driverId}</td>
                        <td className="px-2 py-2 text-[oklch(0.7_0_0)]">{d.city}</td>
                        <td className="px-2 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${TIER_META[d.tier].bg} ${TIER_META[d.tier].text} border`}>{d.tier}</span>
                        </td>
                        <td className={`px-2 py-2 text-right tabular-nums font-medium ${TIER_META[d.tier].text}`}>{d.score}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-[oklch(0.7_0_0)]">{d.co2Saving.toLocaleString()}</td>
                        <td className="px-2 py-2 text-right">
                          <button
                            onClick={() => removeFromFleet(d.id)}
                            className="opacity-0 group-hover:opacity-100 text-[oklch(0.55_0_0)] hover:text-[oklch(0.65_0.18_25)] transition-all"
                            aria-label="Remove driver"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

const inputCls =
  "w-full rounded-md bg-[oklch(0.18_0_0)] border border-[oklch(1_0_0/0.1)] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-[oklch(0.72_0.18_152)] focus:ring-1 focus:ring-[oklch(0.72_0.18_152)] transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[oklch(0.7_0_0)] mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-[oklch(0.18_0_0)] border border-[oklch(1_0_0/0.06)] p-3">
      <div className="flex items-center gap-1.5 text-[oklch(0.6_0_0)] text-xs">{icon}<span>{label}</span></div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
