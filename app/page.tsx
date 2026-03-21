"use client";

import { useMemo, useState } from "react";
import referenceStores from "../data/reference-stores.json";

type AreaUnit = "pyeong" | "sqm";
type CurrencyCode = "KRW" | "USD" | "EUR" | "JPY" | "CNY" | "GBP";

type ReferenceStore = {
  storeName: string;
  annualSales: number;
  dailyFootfall: number;
  areaPyeong?: number;
  areaSqm?: number;
  fullTimeStaff: number;
  partTimeStaff: number;
  partTimeWeeklyHours: number;
  targetHeadcount?: number;
};

const FX_RATES: Record<CurrencyCode, number> = {
  KRW: 1,
  USD: 1350,
  EUR: 1470,
  JPY: 9.1,
  CNY: 187,
  GBP: 1715,
};

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function ceil1(value: number) {
  return Math.ceil(value * 10) / 10;
}

function round0(value: number) {
  return Math.round(value);
}

function pyeongToSqm(value: number) {
  return value * 3.305785;
}

function sqmToPyeong(value: number) {
  return value / 3.305785;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getReferenceTargetHeadcount(store: ReferenceStore) {
  if (typeof store.targetHeadcount === "number") {
    return store.targetHeadcount;
  }

  const ft = Number(store.fullTimeStaff) || 0;
  const pt = Number(store.partTimeStaff) || 0;
  const ptHours = Number(store.partTimeWeeklyHours) || 0;

  return round1(ft + pt * (ptHours / 40));
}

function getReferenceAreaPyeong(store: ReferenceStore) {
  if (typeof store.areaPyeong === "number") return store.areaPyeong;
  if (typeof store.areaSqm === "number") return sqmToPyeong(store.areaSqm);
  return 0;
}

function getReferenceAreaSqm(store: ReferenceStore) {
  if (typeof store.areaSqm === "number") return store.areaSqm;
  if (typeof store.areaPyeong === "number") return pyeongToSqm(store.areaPyeong);
  return 0;
}

function parseInputNumber(value: string) {
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "." || cleaned === "-") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumberInput(value: string) {
  const cleaned = value.replace(/,/g, "").replace(/[^\d.]/g, "");

  if (!cleaned) return "";
  if (cleaned === ".") return "0.";

  const hasTrailingDot = cleaned.endsWith(".");
  const parts = cleaned.split(".");
  const integerPart = parts[0] || "0";
  const decimalPart = parts.slice(1).join("");

  const formattedInteger =
    integerPart === "" ? "0" : Number(integerPart).toLocaleString("en-US");

  if (hasTrailingDot) {
    return `${formattedInteger}.`;
  }

  return decimalPart !== ""
    ? `${formattedInteger}.${decimalPart}`
    : formattedInteger;
}

function handleFormattedInput(
  rawValue: string,
  setter: React.Dispatch<React.SetStateAction<string>>
) {
  const cleaned = rawValue.replace(/,/g, "").replace(/[^\d.]/g, "");
  const dotCount = (cleaned.match(/\./g) || []).length;

  const normalized =
    dotCount <= 1
      ? cleaned
      : `${cleaned.split(".")[0]}.${cleaned.split(".").slice(1).join("")}`;

  setter(formatNumberInput(normalized));
}

function getMixDeviation(
  ftCount: number,
  ptCount: number,
  ftUnitFte: number,
  ptUnitFte: number,
  targetFtShare: number,
  targetPtShare: number
) {
  const ftFte = ftCount * ftUnitFte;
  const ptFte = ptCount * ptUnitFte;
  const totalFte = ftFte + ptFte;

  if (totalFte <= 0) return Number.POSITIVE_INFINITY;

  const ftShare = ftFte / totalFte;
  const ptShare = ptFte / totalFte;

  return Math.abs(ftShare - targetFtShare) + Math.abs(ptShare - targetPtShare);
}

export default function Home() {
  const [currencySearch, setCurrencySearch] = useState("KRW");
  const [annualSalesInput, setAnnualSalesInput] = useState("1,200,000,000");
  const [dailyFootfall, setDailyFootfall] = useState("180");

  const [areaUnit, setAreaUnit] = useState<AreaUnit>("pyeong");
  const [areaInput, setAreaInput] = useState("45");

  const [dailyOpenHours, setDailyOpenHours] = useState("10");
  const [minimumOperatingStaff, setMinimumOperatingStaff] = useState("2");

  const [avgCheckoutMinutes, setAvgCheckoutMinutes] = useState("12");
  const [workDaysPerWeek, setWorkDaysPerWeek] = useState("5");
  const [workHoursPerDay, setWorkHoursPerDay] = useState("8");
  const [breakMinutesPerDay, setBreakMinutesPerDay] = useState("60");

  const [fullTimeWeeklyHours, setFullTimeWeeklyHours] = useState("40");
  const [partTimeWeeklyHours, setPartTimeWeeklyHours] = useState("24");
  const [storeMaturity, setStoreMaturity] = useState("100");

  const conservativeFactor = 1.02;

  const fixedCustomersPerStaffPerDay = 70;
  const fixedAreaPerStaff = 15;
  const fixedAvgTicketKrw = 350000;

  const footfallWeight = 0.9;
  const areaWeight = 0.5;
  const openHoursWeight = 0.89;
  const checkoutWeight = 0.1;
  const minimumStaffWeight = 0.02;
  const maxMaturityPenalty = 0.5;

  const lowSalesBlendFloor = 1_000_000_000;
  const lowSalesBlendCeiling = 4_000_000_000;
  const maxReferenceBlendWeight = 0.9;

  const selectedCurrency = useMemo(() => {
    const keyword = currencySearch.toUpperCase().trim();
    if (keyword in FX_RATES) return keyword as CurrencyCode;
    return "KRW" as CurrencyCode;
  }, [currencySearch]);

  const annualSalesKrw = useMemo(() => {
    const rawValue = parseInputNumber(annualSalesInput);
    return rawValue * FX_RATES[selectedCurrency];
  }, [annualSalesInput, selectedCurrency]);

  const normalizedArea = useMemo(() => {
    const rawArea = parseInputNumber(areaInput);

    const areaPyeong = areaUnit === "pyeong" ? rawArea : sqmToPyeong(rawArea);
    const areaSqm = areaUnit === "sqm" ? rawArea : pyeongToSqm(rawArea);

    return {
      areaPyeong: round1(areaPyeong),
      areaSqm: round1(areaSqm),
    };
  }, [areaInput, areaUnit]);

  const closestReference = useMemo(() => {
    const stores = referenceStores as ReferenceStore[];
    if (!stores.length) return null;

    const currentSales = annualSalesKrw;
    const currentFootfall = parseInputNumber(dailyFootfall);
    const currentAreaPyeong = normalizedArea.areaPyeong;

    const scored = stores.map((store) => {
      const referenceTarget = getReferenceTargetHeadcount(store);
      const referenceAreaPyeong = getReferenceAreaPyeong(store);
      const referenceAreaSqm = getReferenceAreaSqm(store);

      const salesScore =
        Math.abs(store.annualSales - currentSales) / 100000000;
      const areaScore = Math.abs(referenceAreaPyeong - currentAreaPyeong) / 5;
      const footfallScore =
        Math.abs(store.dailyFootfall - currentFootfall) / 10;

      const score =
        salesScore * 0.45 + areaScore * 0.45 + footfallScore * 0.1;

      const ptFte =
        (Number(store.partTimeStaff) || 0) *
        ((Number(store.partTimeWeeklyHours) || 0) / 40);
      const ftFte = Number(store.fullTimeStaff) || 0;
      const totalFte = referenceTarget || 0;

      const ftShare = totalFte > 0 ? ftFte / totalFte : 0;
      const ptShare = totalFte > 0 ? ptFte / totalFte : 0;

      return {
        ...store,
        referenceTarget: round1(referenceTarget),
        referenceAreaPyeong: round1(referenceAreaPyeong),
        referenceAreaSqm: round1(referenceAreaSqm),
        ftShare,
        ptShare,
        score: round1(score),
      };
    });

    scored.sort((a, b) => a.score - b.score);
    return scored[0];
  }, [annualSalesKrw, dailyFootfall, normalizedArea.areaPyeong]);

  const result = useMemo(() => {
    const sales = annualSalesKrw;
    const footfall = parseInputNumber(dailyFootfall);
    const areaPyeong = normalizedArea.areaPyeong;
    const openHours = parseInputNumber(dailyOpenHours);
    const minOperatingStaff = parseInputNumber(minimumOperatingStaff);
    const avgCheckout = parseInputNumber(avgCheckoutMinutes);

    const customersPerStaff = fixedCustomersPerStaffPerDay;
    const ticket = fixedAvgTicketKrw;
    const workDays = parseInputNumber(workDaysPerWeek) || 5;
    const workHours = parseInputNumber(workHoursPerDay) || 8;
    const breakMinutes = parseInputNumber(breakMinutesPerDay) || 60;

    const ftWeeklyHours = parseInputNumber(fullTimeWeeklyHours) || 40;
    const ptWeeklyHours = parseInputNumber(partTimeWeeklyHours) || 24;
    const areaCoverage = fixedAreaPerStaff;
    const maturity = Math.min(
      100,
      Math.max(0, parseInputNumber(storeMaturity) || 0)
    );

    const annualWorkHoursPerPerson = workHours * workDays * 52;
    const dailyPresenceHours = workHours + breakMinutes / 60;

    const salesBaselineFTE = sales / 1000000000;
    const footfallBaseFTE =
      customersPerStaff > 0 ? footfall / customersPerStaff : 0;
    const areaBaseFTE = areaCoverage > 0 ? areaPyeong / areaCoverage : 0;
    const openHoursExcessRatio = Math.max(openHours / 8 - 1, 0);

    const yearlyTransactions = ticket > 0 ? sales / ticket : 0;
    const yearlyCheckoutHours = (yearlyTransactions * avgCheckout) / 60;
    const checkoutFTE =
      annualWorkHoursPerPerson > 0
        ? yearlyCheckoutHours / annualWorkHoursPerPerson
        : 0;

    const footfallExcessFTE = Math.max(
      footfallBaseFTE - salesBaselineFTE * 1.0,
      0
    );

    const areaExcessFTE = Math.max(
      areaBaseFTE - salesBaselineFTE * 0.5,
      0
    );

    const footfallAdjustment = footfallExcessFTE * footfallWeight;
    const areaAdjustment = areaExcessFTE * areaWeight;

    const openHoursAdjustment =
      (salesBaselineFTE * 0.22 + areaBaseFTE * 0.78) *
      openHoursExcessRatio *
      openHoursWeight;

    const checkoutAdjustment = checkoutFTE * checkoutWeight;
    const minimumStaffAdjustment =
      Math.max(minOperatingStaff - 2, 0) * minimumStaffWeight;

    const maturityFactor = 1 + ((100 - maturity) / 100) * maxMaturityPenalty;

    const rawFTEBeforeMaturity =
      salesBaselineFTE +
      footfallAdjustment +
      areaAdjustment +
      openHoursAdjustment +
      checkoutAdjustment +
      minimumStaffAdjustment;

    const rawFTE = Math.max(rawFTEBeforeMaturity, salesBaselineFTE);
    const calculatedHC = ceil1(rawFTE * maturityFactor * conservativeFactor);

    const referenceHC = closestReference?.referenceTarget ?? calculatedHC;

    let referenceBlendWeight = 0;
    let lowSalesOpsUplift = 0;

    if (sales < 5_000_000_000) {
      const salesBlendStrength = maxReferenceBlendWeight * (1 - sales / 5_000_000_000);
      const footfallScore = clamp((footfall - 120) / 180, 0, 1);
      const minStaffScore = clamp((minOperatingStaff - 2) / 2, 0, 1);
      const operationalScore = clamp(footfallScore * 0.7 + minStaffScore * 0.3, 0, 1);

      referenceBlendWeight =
        salesBlendStrength * (0.15 + operationalScore * 0.85);

      lowSalesOpsUplift =
        clamp((footfall - 180) / 120, 0, 1) * 1.2 +
        clamp((minOperatingStaff - 2) / 2, 0, 1) * 1.0;
    } else if (sales <= lowSalesBlendFloor) {
      referenceBlendWeight = maxReferenceBlendWeight;
    } else if (sales < lowSalesBlendCeiling) {
      const progress =
        (sales - lowSalesBlendFloor) /
        (lowSalesBlendCeiling - lowSalesBlendFloor);
      referenceBlendWeight = maxReferenceBlendWeight * (1 - progress);
    }

    const hcBeforeBlend = calculatedHC + lowSalesOpsUplift;

    const blendedHC =
      hcBeforeBlend * (1 - referenceBlendWeight) +
      referenceHC * referenceBlendWeight;

    const recommendedHC = round1(blendedHC);

    return {
      recommendedHC,
      calculatedHC: round1(calculatedHC),
      referenceHC: round1(referenceHC),
      referenceBlendWeight: round1(referenceBlendWeight * 100),
      annualSalesKrw: round0(sales),
      areaPyeong: normalizedArea.areaPyeong,
      areaSqm: normalizedArea.areaSqm,
      dailyPresenceHours: round1(dailyPresenceHours),
      salesBaselineFTE: round1(salesBaselineFTE),
      footfallBaseFTE: round1(footfallBaseFTE),
      areaBaseFTE: round1(areaBaseFTE),
      checkoutFTE: round1(checkoutFTE),
      footfallAdjustment: round1(footfallAdjustment),
      areaAdjustment: round1(areaAdjustment),
      openHoursAdjustment: round1(openHoursAdjustment),
      checkoutAdjustment: round1(checkoutAdjustment),
      minimumStaffAdjustment: round1(minimumStaffAdjustment),
      ftWeeklyHours: round1(ftWeeklyHours),
      ptWeeklyHours: round1(ptWeeklyHours),
    };
  }, [
    annualSalesKrw,
    dailyFootfall,
    normalizedArea,
    dailyOpenHours,
    minimumOperatingStaff,
    avgCheckoutMinutes,
    workDaysPerWeek,
    workHoursPerDay,
    breakMinutesPerDay,
    fullTimeWeeklyHours,
    partTimeWeeklyHours,
    storeMaturity,
    closestReference,
  ]);

  const referenceBasedMix = useMemo(() => {
    const totalTarget = result.recommendedHC;
    const sales = annualSalesKrw;
    const footfall = parseInputNumber(dailyFootfall);
    const openHours = parseInputNumber(dailyOpenHours) || 8;
    const minOperatingStaff = parseInputNumber(minimumOperatingStaff) || 2;
    const ftHours = parseInputNumber(fullTimeWeeklyHours) || 40;
    const ptHours = parseInputNumber(partTimeWeeklyHours) || 24;

    const ftUnitFte = 1;
    const ptUnitFte = ftHours > 0 ? ptHours / ftHours : 0;

    const openHoursExcessRatio = Math.max(openHours / 8 - 1, 0);

    const highSalesBaseFtShare = 0.72;
    const highSalesOpenHoursPenalty = 0.095;
    const highSalesFtShare = clamp(
      highSalesBaseFtShare - openHoursExcessRatio * highSalesOpenHoursPenalty,
      0.55,
      0.8
    );

    const referenceFtShare =
      closestReference && typeof closestReference.ftShare === "number"
        ? closestReference.ftShare
        : highSalesFtShare;

    let targetFtShare = highSalesFtShare;
    let referenceMixBlendWeight = 0;

    if (sales < 5_000_000_000) {
      const baseLowSalesFtShare = 0.72;

      const footfallDelta = (footfall - 180) / 180;
      const footfallAdjustment = clamp(footfallDelta * -0.1, -0.12, 0.08);

      const openHoursAdjustment = clamp(openHoursExcessRatio * -0.015, -0.05, 0);

      let minStaffAdjustment = 0;
      if (minOperatingStaff <= 2) {
        minStaffAdjustment = 0.04;
      } else if (minOperatingStaff === 3) {
        minStaffAdjustment = 0;
      } else if (minOperatingStaff === 4) {
        minStaffAdjustment = -0.04;
      } else if (minOperatingStaff >= 5) {
        minStaffAdjustment = -0.06;
      }

      const operationFtShare = clamp(
        baseLowSalesFtShare +
          footfallAdjustment +
          openHoursAdjustment +
          minStaffAdjustment,
        0.5,
        0.8
      );

      referenceMixBlendWeight = 0.18 * (1 - sales / 5_000_000_000);

      targetFtShare = clamp(
        operationFtShare * (1 - referenceMixBlendWeight) +
          referenceFtShare * referenceMixBlendWeight,
        0.5,
        0.8
      );
    }

    const targetPtShare = 1 - targetFtShare;

    const targetFtFte = totalTarget * targetFtShare;
    const targetPtFte = totalTarget * targetPtShare;

    let suggestedFT =
      ftUnitFte > 0 ? Math.round(targetFtFte / ftUnitFte) : 0;

    let suggestedPT =
      ptUnitFte > 0 ? Math.round(targetPtFte / ptUnitFte) : 0;

    let realizedFte = suggestedFT * ftUnitFte + suggestedPT * ptUnitFte;

    let safety = 0;
    while (realizedFte < totalTarget && safety < 100) {
      const ftCandidateDeviation = getMixDeviation(
        suggestedFT + 1,
        suggestedPT,
        ftUnitFte,
        ptUnitFte,
        targetFtShare,
        targetPtShare
      );

      const ptCandidateDeviation = getMixDeviation(
        suggestedFT,
        suggestedPT + 1,
        ftUnitFte,
        ptUnitFte,
        targetFtShare,
        targetPtShare
      );

      if (ftCandidateDeviation <= ptCandidateDeviation) {
        suggestedFT += 1;
      } else {
        suggestedPT += 1;
      }

      realizedFte = suggestedFT * ftUnitFte + suggestedPT * ptUnitFte;
      safety += 1;
    }

    return {
      suggestedFT,
      suggestedPT,
      realizedFte: round1(realizedFte),
      targetFtShare: round1(targetFtShare * 100),
      targetPtShare: round1(targetPtShare * 100),
      ftUnitFte: round1(ftUnitFte),
      ptUnitFte: round1(ptUnitFte),
      referenceMixBlendWeight: round1(referenceMixBlendWeight * 100),
    };
  }, [
    result.recommendedHC,
    annualSalesKrw,
    dailyFootfall,
    dailyOpenHours,
    minimumOperatingStaff,
    fullTimeWeeklyHours,
    partTimeWeeklyHours,
    closestReference,
  ]);

  const referenceStoreStaffing = useMemo(() => {
    if (!closestReference) return null;

    const ftCount = Number(closestReference.fullTimeStaff) || 0;
    const ptCount = Number(closestReference.partTimeStaff) || 0;
    const ptWeeklyHours = Number(closestReference.partTimeWeeklyHours) || 0;

    const ftUnitFte = 1;
    const ptUnitFte = ptWeeklyHours / 40;
    const ftFte = ftCount * ftUnitFte;
    const ptFte = ptCount * ptUnitFte;
    const totalFte = ftFte + ptFte;

    return {
      ftCount,
      ptCount,
      ftFte: round1(ftFte),
      ptFte: round1(ptFte),
      totalFte: round1(totalFte),
      ptWeeklyHours: round1(ptWeeklyHours),
    };
  }, [closestReference]);

  const shellClass =
    "min-h-screen bg-black text-white uppercase bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_30%),linear-gradient(to_bottom,rgba(255,255,255,0.03),rgba(255,255,255,0))]";
  const sidebarCard =
    "rounded-[28px] border border-white/12 bg-white/[0.04] p-5 sm:p-6 backdrop-blur-sm";
  const contentCard =
    "rounded-[28px] border border-white/12 bg-white/[0.04] p-5 sm:p-6 backdrop-blur-sm";
  const inputClass =
    "w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 transition focus:border-white/30 focus:bg-white/[0.08]";
  const selectClass =
    "w-full rounded-2xl border border-white/12 bg-black px-4 py-3 text-sm text-white outline-none transition focus:border-white/30";
  const labelClass =
    "mb-2 block text-[11px] font-bold tracking-[0.18em] text-white/60";
  const metricRowClass =
    "flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3";
  const softValueClass = "text-sm font-medium text-white";
  const softLabelClass = "text-[11px] font-bold tracking-[0.18em] text-white/50";
  const helperCardClass =
    "rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80";

  return (
    <main className={shellClass}>
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-6">
          <aside className="lg:sticky lg:top-6 lg:h-[calc(100vh-48px)] lg:overflow-y-auto">
            <div className="mb-4 rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-7">
              <p className="text-xs font-semibold tracking-[0.28em] text-white/45">
                IICOMBINED
              </p>
              <h1 className="mt-3 text-2xl font-bold tracking-[0.08em] text-white sm:text-3xl">
                HC CALCULATOR
              </h1>
            </div>

            <div className="space-y-4 pb-2">
              <section className={sidebarCard}>
                <h2 className="mb-5 text-sm font-bold tracking-[0.24em] text-white">
                  기본 정보
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>환율 검색</label>
                    <input
                      type="text"
                      value={currencySearch}
                      onChange={(e) => setCurrencySearch(e.target.value.toUpperCase())}
                      placeholder="KRW / USD / EUR"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>연간 매출</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={annualSalesInput}
                      onChange={(e) =>
                        handleFormattedInput(e.target.value, setAnnualSalesInput)
                      }
                      className={inputClass}
                    />
                  </div>

                  <div className={helperCardClass}>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[11px] font-bold tracking-[0.18em] text-white/50">
                        KRW CONVERTED SALES
                      </span>
                      <span className="font-semibold text-white">
                        ₩ {round0(result.annualSalesKrw).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>일 평균 입점객</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={dailyFootfall}
                      onChange={(e) =>
                        handleFormattedInput(e.target.value, setDailyFootfall)
                      }
                      className={inputClass}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
                    <div>
                      <label className={labelClass}>매장 면적</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={areaInput}
                        onChange={(e) =>
                          handleFormattedInput(e.target.value, setAreaInput)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>단위</label>
                      <select
                        value={areaUnit}
                        onChange={(e) => setAreaUnit(e.target.value as AreaUnit)}
                        className={selectClass}
                      >
                        <option value="pyeong">PYEONG</option>
                        <option value="sqm">SQM</option>
                      </select>
                    </div>
                  </div>

                  <div className={helperCardClass}>
                    {result.areaPyeong} 평 / {result.areaSqm} SQM
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>일 영업 시간</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={dailyOpenHours}
                        onChange={(e) =>
                          handleFormattedInput(e.target.value, setDailyOpenHours)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>최소 운영 인원</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={minimumOperatingStaff}
                        onChange={(e) =>
                          handleFormattedInput(
                            e.target.value,
                            setMinimumOperatingStaff
                          )
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className={sidebarCard}>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold tracking-[0.24em] text-white">
                    인력 운영 기준
                  </h2>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-white/45">
                    SIMPLIFIED
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>평균 결제 시간(분)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={avgCheckoutMinutes}
                      onChange={(e) =>
                        handleFormattedInput(
                          e.target.value,
                          setAvgCheckoutMinutes
                        )
                      }
                      className={inputClass}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className={labelClass}>주당 근무일수</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={workDaysPerWeek}
                        onChange={(e) =>
                          handleFormattedInput(e.target.value, setWorkDaysPerWeek)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>일 근무시간</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={workHoursPerDay}
                        onChange={(e) =>
                          handleFormattedInput(e.target.value, setWorkHoursPerDay)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>일 휴게시간(분)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={breakMinutesPerDay}
                        onChange={(e) =>
                          handleFormattedInput(
                            e.target.value,
                            setBreakMinutesPerDay
                          )
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>FT 주간 평균 근무시간</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={fullTimeWeeklyHours}
                        onChange={(e) =>
                          handleFormattedInput(
                            e.target.value,
                            setFullTimeWeeklyHours
                          )
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>PT 주간 평균 근무시간</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={partTimeWeeklyHours}
                        onChange={(e) =>
                          handleFormattedInput(
                            e.target.value,
                            setPartTimeWeeklyHours
                          )
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>매장 성숙도 (0~100)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={storeMaturity}
                      onChange={(e) =>
                        handleFormattedInput(e.target.value, setStoreMaturity)
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
              </section>
            </div>
          </aside>

          <section className="min-w-0">
            <div className="space-y-4 sm:space-y-6">
              <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-[32px] border border-white/10 bg-white px-6 py-7 text-black shadow-[0_20px_80px_rgba(255,255,255,0.08)] sm:px-8 sm:py-8 flex flex-col items-center justify-center text-center">
                  <p className="text-[11px] font-bold tracking-[0.22em] text-black/45">
                    CALCULATED HC
                  </p>
                  <div className="mt-5">
                    <h2 className="text-6xl font-bold leading-none sm:text-7xl">
                      {result.recommendedHC}
                    </h2>
                    <p className="mt-3 text-sm text-black/55">FTE</p>
                  </div>
                </div>

                <div className="rounded-[32px] border border-white/12 bg-white/[0.05] px-6 py-7 sm:px-8 sm:py-8 flex flex-col items-center justify-center text-center">
                  <p className="text-[11px] font-bold tracking-[0.22em] text-white/45">
                    CLOSEST REFERENCE STORE
                  </p>
                  <h2 className="mt-5 break-words text-2xl font-bold text-white sm:text-3xl">
                    {closestReference ? closestReference.storeName.toUpperCase() : "-"}
                  </h2>
                  <div className="mt-8">
                    <p className="text-5xl font-bold leading-none text-white sm:text-6xl">
                      {closestReference ? closestReference.referenceTarget : "-"}
                    </p>
                    <p className="mt-3 text-sm text-white/55">REFERENCE FTE</p>
                  </div>
                </div>
              </div>

              <div className={contentCard}>
                <h3 className="text-lg font-bold text-white">COMPARISON</h3>

                {closestReference ? (
                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[24px] border border-white/10 bg-white p-5 text-black sm:p-6">
                      <p className="text-[11px] font-bold tracking-[0.22em] text-black/45">
                        NEW STORE
                      </p>
                      <div className="mt-4 space-y-3 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-black/60">ANNUAL SALES INPUT</span>
                          <span className="font-semibold">{annualSalesInput}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-black/60">APPLIED FX</span>
                          <span className="font-semibold">{selectedCurrency}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-black/60">ANNUAL SALES KRW</span>
                          <span className="font-semibold">
                            {round0(result.annualSalesKrw).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-black/60">DAILY FOOTFALL</span>
                          <span className="font-semibold">
                            {parseInputNumber(dailyFootfall).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-black/60">AREA</span>
                          <span className="font-semibold">
                            {result.areaPyeong} 평 / {result.areaSqm} SQM
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-black/60">CALCULATED HC</span>
                          <span className="font-semibold">
                            {result.calculatedHC}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-black/60">BLENDED HC</span>
                          <span className="font-semibold">
                            {result.recommendedHC}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-black/60">REFERENCE BLEND</span>
                          <span className="font-semibold">
                            {result.referenceBlendWeight}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-white sm:p-6">
                      <p className="text-[11px] font-bold tracking-[0.22em] text-white/45">
                        REFERENCE STORE
                      </p>
                      <div className="mt-4 space-y-3 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-white/60">STORE NAME</span>
                          <span className="font-semibold">
                            {closestReference.storeName.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-white/60">ANNUAL SALES</span>
                          <span className="font-semibold">
                            {round0(closestReference.annualSales).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-white/60">DAILY FOOTFALL</span>
                          <span className="font-semibold">
                            {round0(closestReference.dailyFootfall).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-white/60">AREA</span>
                          <span className="font-semibold">
                            {closestReference.referenceAreaPyeong} 평 /{" "}
                            {closestReference.referenceAreaSqm} SQM
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-white/60">REFERENCE HC</span>
                          <span className="font-semibold">
                            {closestReference.referenceTarget}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-white/60">
                    NO REFERENCE STORE DATA FOUND.
                  </p>
                )}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className={contentCard}>
                  <h3 className="text-lg font-bold text-white">
                    REFERENCE-BASED FT / PT SUGGESTION
                  </h3>
                  <div className="mt-5 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-[22px] border border-white/10 bg-white px-5 py-5 text-black">
                        <p className="text-[11px] font-bold tracking-[0.18em] text-black/45">
                          SUGGESTED FT
                        </p>
                        <p className="mt-3 text-3xl font-bold">
                          {referenceBasedMix.suggestedFT}
                        </p>
                        <p className="mt-1 text-sm text-black/55">명</p>
                      </div>
                      <div className="rounded-[22px] border border-white/10 bg-white/[0.05] px-5 py-5 text-white">
                        <p className="text-[11px] font-bold tracking-[0.18em] text-white/45">
                          SUGGESTED PT
                        </p>
                        <p className="mt-3 text-3xl font-bold">
                          {referenceBasedMix.suggestedPT}
                        </p>
                        <p className="mt-1 text-sm text-white/55">명</p>
                      </div>
                    </div>

                    <div className={metricRowClass}>
                      <span className={softLabelClass}>REALIZED FTE</span>
                      <span className={softValueClass}>
                        {referenceBasedMix.realizedFte}
                      </span>
                    </div>
                    <div className={metricRowClass}>
                      <span className={softLabelClass}>FT UNIT FTE</span>
                      <span className={softValueClass}>
                        {referenceBasedMix.ftUnitFte}
                      </span>
                    </div>
                    <div className={metricRowClass}>
                      <span className={softLabelClass}>PT UNIT FTE</span>
                      <span className={softValueClass}>
                        {referenceBasedMix.ptUnitFte}
                      </span>
                    </div>
                    <div className={metricRowClass}>
                      <span className={softLabelClass}>TARGET FT SHARE</span>
                      <span className={softValueClass}>
                        {referenceBasedMix.targetFtShare}%
                      </span>
                    </div>
                    <div className={metricRowClass}>
                      <span className={softLabelClass}>TARGET PT SHARE</span>
                      <span className={softValueClass}>
                        {referenceBasedMix.targetPtShare}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className={contentCard}>
                  <h3 className="text-lg font-bold text-white">
                    REFERENCE STORE STAFFING
                  </h3>
                  {referenceStoreStaffing && closestReference ? (
                    <div className="mt-5 space-y-3">
                      <div className="rounded-[22px] border border-white/10 bg-white/[0.05] px-5 py-5">
                        <p className="text-[11px] font-bold tracking-[0.18em] text-white/45">
                          REFERENCE STORE
                        </p>
                        <p className="mt-3 break-words text-2xl font-bold text-white">
                          {closestReference.storeName.toUpperCase()}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-[22px] border border-white/10 bg-white px-5 py-5 text-black">
                          <p className="text-[11px] font-bold tracking-[0.18em] text-black/45">
                            FT COUNT
                          </p>
                          <p className="mt-3 text-3xl font-bold">
                            {referenceStoreStaffing.ftCount}
                          </p>
                          <p className="mt-1 text-sm text-black/55">명</p>
                        </div>

                        <div className="rounded-[22px] border border-white/10 bg-white/[0.05] px-5 py-5 text-white">
                          <p className="text-[11px] font-bold tracking-[0.18em] text-white/45">
                            PT COUNT
                          </p>
                          <p className="mt-3 text-3xl font-bold">
                            {referenceStoreStaffing.ptCount}
                          </p>
                          <p className="mt-1 text-sm text-white/55">명</p>
                        </div>
                      </div>

                      <div className={metricRowClass}>
                        <span className={softLabelClass}>FT FTE</span>
                        <span className={softValueClass}>
                          {referenceStoreStaffing.ftFte}
                        </span>
                      </div>
                      <div className={metricRowClass}>
                        <span className={softLabelClass}>PT FTE</span>
                        <span className={softValueClass}>
                          {referenceStoreStaffing.ptFte}
                        </span>
                      </div>
                      <div className={metricRowClass}>
                        <span className={softLabelClass}>PT WEEKLY HOURS</span>
                        <span className={softValueClass}>
                          {referenceStoreStaffing.ptWeeklyHours}H
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white px-4 py-4 text-black">
                        <span className="text-[11px] font-bold tracking-[0.18em] text-black/45">
                          TOTAL FTE
                        </span>
                        <span className="text-lg font-bold">
                          {referenceStoreStaffing.totalFte}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-white/60">
                      REFERENCE STORE DATA IS REQUIRED.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
