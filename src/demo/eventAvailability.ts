// Korean launch time, independent of the visitor's time zone.
export const EVENT_OPENS_AT = Date.parse('2026-11-09T00:00:00+09:00');
export const EVENT_OPEN_LABEL = '11월 9일 월요일 00:00 (한국 시간)';
export const isEventOpen = (now = Date.now()) => now >= EVENT_OPENS_AT;
