const valid = v => typeof v === 'number' && Number.isFinite(v) && Number.isSafeInteger(Math.round(v*100)) && v >= 0;
const cents = v => Math.round(v * 100);
export function calculate(full, ratio, pay) {
  pay ??= full.minPay;
  if (![pay,full.rebate,ratio.ratioPercent,ratio.maxCashback].every(valid)) return {status:'needs_input',message:'请填写订单实付、返现金额、比例及封顶；未知值不按零计算'};
  if (valid(full.minPay) && cents(pay) < cents(full.minPay)) return {status:'below_threshold',message:'订单实付未达到所选满返门槛'};
  const fullRebate = full.rebate;
  const ratioRebate = Math.min(cents(pay * ratio.ratioPercent / 100), cents(ratio.maxCashback));
  return {status:'ok',pay,fullRebate,ratioRebate:ratioRebate / 100,net:(cents(pay)-cents(fullRebate)-ratioRebate)/100};
}
export function bestCombination(full, ratio, pay) {
  const options = full.flatMap((f, fullIndex) => ratio.map((r, ratioIndex) => ({...calculate(f,r,pay),fullIndex,ratioIndex})));
  return options.filter(o=>o.status==='ok').sort((a,b)=>a.net-b.net)[0] ?? options[0] ?? null;
}
