export type HealthEventType =
  | 'medicine'
  | 'reminder'
  | 'vitals'
  | 'report'
  | 'location'
  | 'visit_prep'
  | 'family'
  | 'note';

export type HealthEventSeverity = 'info' | 'normal' | 'warning' | 'critical';

export type MedicineStatus = 'active' | 'paused' | 'completed';

export interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  age?: string;
  sex?: string;
  conditions?: string[];
  allergies?: string[];
  emergencyContact?: string;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MedicineCabinetItem {
  id: string;
  memberId: string;
  name: string;
  genericName?: string;
  strength?: string;
  form?: string;
  dosage?: string;
  frequency?: string;
  scheduleTimes: string[];
  instructions?: string;
  prescriber?: string;
  stockCount?: number;
  refillAt?: string;
  startDate?: string;
  endDate?: string;
  source?: 'manual' | 'chat' | 'report' | 'prescription';
  status: MedicineStatus;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MedicineReminderRecord {
  id: string;
  memberId: string;
  medicineId?: string;
  title: string;
  time: string;
  enabled: boolean;
  email?: string;
  source: 'local' | 'email' | 'both';
  notificationIds?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface HealthTimelineEvent {
  id: string;
  memberId: string;
  type: HealthEventType;
  title: string;
  description?: string;
  timestamp: number;
  severity: HealthEventSeverity;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface HealthReportRecord {
  id: string;
  memberId: string;
  title: string;
  reportType?: string;
  capturedAt: number;
  sourceFileName?: string;
  extractedText?: string;
  extractedValues?: Array<{
    name: string;
    value: string;
    unit?: string;
    range?: string;
    status?: 'low' | 'normal' | 'high' | 'critical' | 'unknown';
  }>;
  summary?: string;
  confidence?: 'low' | 'medium' | 'high';
  originalName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface VisitPrepRecord {
  id: string;
  memberId: string;
  title: string;
  visitReason: string;
  doctorOrSpecialty?: string;
  generatedAt: number;
  summary: string;
  questions?: string[];
  redFlags?: string[];
  sourceEventIds?: string[];
  pdfName?: string;
}

export interface HealthDataStore {
  schemaVersion: 1;
  activeMemberId: string;
  familyMembers: FamilyMember[];
  medicines: MedicineCabinetItem[];
  reminders: MedicineReminderRecord[];
  timeline: HealthTimelineEvent[];
  reports: HealthReportRecord[];
  visitPreps: VisitPrepRecord[];
}

const STORE_KEY = 'healthguard_health_store_v1';
const VITALS_KEY = 'healthguard_vitals';
const MAX_TIMELINE_EVENTS = 500;

function now(): number {
  return Date.now();
}

export function createHealthId(prefix: string): string {
  return `${prefix}_${now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultMember(): FamilyMember {
  const timestamp = now();
  return {
    id: 'member_self',
    name: 'Self',
    relation: 'Self',
    isDefault: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createEmptyHealthStore(): HealthDataStore {
  const defaultMember = getDefaultMember();
  return {
    schemaVersion: 1,
    activeMemberId: defaultMember.id,
    familyMembers: [defaultMember],
    medicines: [],
    reminders: [],
    timeline: [],
    reports: [],
    visitPreps: [],
  };
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeStore(raw: Partial<HealthDataStore> | null | undefined): HealthDataStore {
  const fallback = createEmptyHealthStore();
  if (!raw || typeof raw !== 'object') return fallback;

  const familyMembers = Array.isArray(raw.familyMembers) && raw.familyMembers.length > 0
    ? raw.familyMembers
    : fallback.familyMembers;
  const activeMemberId = familyMembers.some(member => member.id === raw.activeMemberId)
    ? String(raw.activeMemberId)
    : familyMembers[0].id;

  return {
    schemaVersion: 1,
    activeMemberId,
    familyMembers,
    medicines: Array.isArray(raw.medicines) ? raw.medicines : [],
    reminders: Array.isArray(raw.reminders) ? raw.reminders : [],
    timeline: Array.isArray(raw.timeline) ? raw.timeline.slice(0, MAX_TIMELINE_EVENTS) : [],
    reports: Array.isArray(raw.reports) ? raw.reports : [],
    visitPreps: Array.isArray(raw.visitPreps) ? raw.visitPreps : [],
  };
}

export function loadHealthStore(): HealthDataStore {
  if (typeof window === 'undefined') return createEmptyHealthStore();
  const parsed = safeParse<Partial<HealthDataStore>>(window.localStorage.getItem(STORE_KEY), {});
  return normalizeStore(parsed);
}

export function saveHealthStore(store: HealthDataStore): HealthDataStore {
  const normalized = normalizeStore(store);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('healthguard:health-store-updated'));
  }
  return normalized;
}

export function updateHealthStore(mutator: (store: HealthDataStore) => HealthDataStore): HealthDataStore {
  const current = loadHealthStore();
  return saveHealthStore(mutator(current));
}

export function getActiveMember(store = loadHealthStore()): FamilyMember {
  return store.familyMembers.find(member => member.id === store.activeMemberId) || store.familyMembers[0] || getDefaultMember();
}

export function addTimelineEvent(
  event: Omit<HealthTimelineEvent, 'id' | 'memberId' | 'timestamp' | 'severity'> & {
    id?: string;
    memberId?: string;
    timestamp?: number;
    severity?: HealthEventSeverity;
  }
): HealthTimelineEvent {
  const created: HealthTimelineEvent = {
    id: event.id || createHealthId('event'),
    memberId: event.memberId || loadHealthStore().activeMemberId,
    type: event.type,
    title: event.title,
    description: event.description,
    timestamp: event.timestamp || now(),
    severity: event.severity || 'info',
    source: event.source,
    metadata: event.metadata,
  };

  updateHealthStore(store => ({
    ...store,
    timeline: [created, ...store.timeline].slice(0, MAX_TIMELINE_EVENTS),
  }));

  return created;
}

export function upsertMedicine(
  medicine: Partial<MedicineCabinetItem> & Pick<MedicineCabinetItem, 'name'>
): MedicineCabinetItem {
  const timestamp = now();
  let saved: MedicineCabinetItem;

  updateHealthStore(store => {
    const existing = medicine.id
      ? store.medicines.find(item => item.id === medicine.id)
      : undefined;
    const memberId = medicine.memberId || existing?.memberId || store.activeMemberId;

    saved = {
      id: medicine.id || existing?.id || createHealthId('med'),
      memberId,
      name: medicine.name.trim(),
      genericName: medicine.genericName?.trim() || undefined,
      strength: medicine.strength?.trim() || undefined,
      form: medicine.form?.trim() || undefined,
      dosage: medicine.dosage?.trim() || undefined,
      frequency: medicine.frequency?.trim() || undefined,
      scheduleTimes: Array.isArray(medicine.scheduleTimes)
        ? medicine.scheduleTimes.filter(Boolean)
        : existing?.scheduleTimes || [],
      instructions: medicine.instructions?.trim() || undefined,
      prescriber: medicine.prescriber?.trim() || undefined,
      stockCount: typeof medicine.stockCount === 'number' && Number.isFinite(medicine.stockCount)
        ? medicine.stockCount
        : undefined,
      refillAt: medicine.refillAt || undefined,
      startDate: medicine.startDate || existing?.startDate || new Date(timestamp).toISOString().slice(0, 10),
      endDate: medicine.endDate || undefined,
      source: medicine.source || existing?.source || 'manual',
      status: medicine.status || existing?.status || 'active',
      notes: medicine.notes?.trim() || undefined,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };

    const medicines = existing
      ? store.medicines.map(item => item.id === saved.id ? saved : item)
      : [saved, ...store.medicines];

    return { ...store, medicines };
  });

  addTimelineEvent({
    memberId: saved!.memberId,
    type: 'medicine',
    title: medicine.id ? `Updated ${saved!.name}` : `Added ${saved!.name}`,
    description: [saved!.strength, saved!.dosage, saved!.frequency].filter(Boolean).join(' | ') || undefined,
    severity: 'info',
    source: 'medicine_cabinet',
    metadata: { medicineId: saved!.id },
  });

  return saved!;
}

export function updateMedicineStatus(id: string, status: MedicineStatus): MedicineCabinetItem | null {
  let updated: MedicineCabinetItem | null = null;
  updateHealthStore(store => {
    const medicines = store.medicines.map(item => {
      if (item.id !== id) return item;
      updated = { ...item, status, updatedAt: now() };
      return updated;
    });
    return { ...store, medicines };
  });

  if (updated) {
    addTimelineEvent({
      memberId: updated.memberId,
      type: 'medicine',
      title: `${updated.name} marked ${status}`,
      severity: status === 'active' ? 'normal' : 'info',
      source: 'medicine_cabinet',
      metadata: { medicineId: updated.id, status },
    });
  }

  return updated;
}

export function deleteMedicine(id: string): void {
  let removed: MedicineCabinetItem | undefined;
  updateHealthStore(store => {
    removed = store.medicines.find(item => item.id === id);
    return {
      ...store,
      medicines: store.medicines.filter(item => item.id !== id),
      reminders: store.reminders.filter(reminder => reminder.medicineId !== id),
    };
  });

  if (removed) {
    addTimelineEvent({
      memberId: removed.memberId,
      type: 'medicine',
      title: `Removed ${removed.name}`,
      severity: 'warning',
      source: 'medicine_cabinet',
      metadata: { medicineId: removed.id },
    });
  }
}

export function upsertMedicineReminder(
  reminder: Partial<MedicineReminderRecord> & Pick<MedicineReminderRecord, 'title' | 'time'>
): MedicineReminderRecord {
  const timestamp = now();
  let saved: MedicineReminderRecord;

  updateHealthStore(store => {
    const existing = reminder.id
      ? store.reminders.find(item => item.id === reminder.id)
      : undefined;
    saved = {
      id: reminder.id || existing?.id || createHealthId('reminder'),
      memberId: reminder.memberId || existing?.memberId || store.activeMemberId,
      medicineId: reminder.medicineId || existing?.medicineId,
      title: reminder.title.trim(),
      time: reminder.time,
      enabled: typeof reminder.enabled === 'boolean' ? reminder.enabled : existing?.enabled ?? true,
      email: reminder.email || existing?.email,
      source: reminder.source || existing?.source || 'local',
      notificationIds: reminder.notificationIds || existing?.notificationIds,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };

    const reminders = existing
      ? store.reminders.map(item => item.id === saved.id ? saved : item)
      : [saved, ...store.reminders];

    return { ...store, reminders };
  });

  addTimelineEvent({
    memberId: saved!.memberId,
    type: 'reminder',
    title: reminder.id ? `Updated reminder: ${saved!.title}` : `Added reminder: ${saved!.title}`,
    description: `Scheduled for ${saved!.time}`,
    severity: 'info',
    source: 'medicine_cabinet',
    metadata: { reminderId: saved!.id, medicineId: saved!.medicineId },
  });

  return saved!;
}

function formatVitalValue(label: string, value: unknown, unit: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return `${label}: ${value}${unit ? ` ${unit}` : ''}`;
}

export function getVitalsTimelineEvents(memberId = 'member_self'): HealthTimelineEvent[] {
  if (typeof window === 'undefined') return [];
  const vitals = safeParse<any[]>(window.localStorage.getItem(VITALS_KEY), []);
  if (!Array.isArray(vitals)) return [];

  return vitals
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => {
      const timestamp = Number(entry.timestamp || new Date(entry.date).getTime() || now());
      const values = [
        entry.bp_systolic ? `BP: ${entry.bp_systolic}/${entry.bp_diastolic || '--'} mmHg` : null,
        formatVitalValue('Sugar', entry.blood_sugar, 'mg/dL'),
        formatVitalValue('Weight', entry.weight, 'kg'),
        formatVitalValue('Temperature', entry.temperature, 'F'),
        formatVitalValue('Heart rate', entry.heart_rate, 'bpm'),
      ].filter(Boolean);

      return {
        id: `vitals_${timestamp}`,
        memberId,
        type: 'vitals' as HealthEventType,
        title: 'Vitals recorded',
        description: values.join(' | ') || entry.notes || undefined,
        timestamp,
        severity: 'normal' as HealthEventSeverity,
        source: 'health_dashboard',
        metadata: { entry },
      };
    });
}

export function listTimelineEvents(options?: {
  memberId?: string;
  includeVitals?: boolean;
  type?: HealthEventType;
}): HealthTimelineEvent[] {
  const store = loadHealthStore();
  const memberId = options?.memberId || store.activeMemberId;
  const storedEvents = store.timeline.filter(event => event.memberId === memberId);
  const events = options?.includeVitals === false
    ? storedEvents
    : [...storedEvents, ...getVitalsTimelineEvents(memberId)];

  return events
    .filter(event => !options?.type || event.type === options.type)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function getMemberMedicines(memberId?: string, status?: MedicineStatus): MedicineCabinetItem[] {
  const store = loadHealthStore();
  const targetMemberId = memberId || store.activeMemberId;
  return store.medicines
    .filter(item => item.memberId === targetMemberId)
    .filter(item => !status || item.status === status)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getUpcomingMedicineReminders(memberId?: string): MedicineReminderRecord[] {
  const store = loadHealthStore();
  const targetMemberId = memberId || store.activeMemberId;
  return store.reminders
    .filter(item => item.memberId === targetMemberId && item.enabled)
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function setActiveFamilyMember(memberId: string): void {
  updateHealthStore(store => {
    if (!store.familyMembers.some(member => member.id === memberId)) return store;
    return { ...store, activeMemberId: memberId };
  });
}

export function upsertFamilyMember(
  member: Partial<FamilyMember> & Pick<FamilyMember, 'name' | 'relation'>
): FamilyMember {
  const timestamp = now();
  let saved: FamilyMember;

  updateHealthStore(store => {
    const existing = member.id ? store.familyMembers.find(item => item.id === member.id) : undefined;
    saved = {
      id: member.id || existing?.id || createHealthId('member'),
      name: member.name.trim(),
      relation: member.relation.trim() || 'Family',
      age: member.age?.trim() || undefined,
      sex: member.sex?.trim() || undefined,
      conditions: Array.isArray(member.conditions) ? member.conditions.filter(Boolean) : existing?.conditions || [],
      allergies: Array.isArray(member.allergies) ? member.allergies.filter(Boolean) : existing?.allergies || [],
      emergencyContact: member.emergencyContact?.trim() || undefined,
      isDefault: existing?.isDefault || false,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };

    const familyMembers = existing
      ? store.familyMembers.map(item => item.id === saved.id ? saved : item)
      : [...store.familyMembers, saved];

    return { ...store, familyMembers, activeMemberId: saved.id };
  });

  addTimelineEvent({
    memberId: saved!.id,
    type: 'family',
    title: member.id ? `Updated profile for ${saved!.name}` : `Added ${saved!.name}`,
    description: `${saved!.relation}${saved!.age ? ` | Age ${saved!.age}` : ''}`,
    severity: 'info',
    source: 'family_mode',
  });

  return saved!;
}

export function deleteFamilyMember(memberId: string): void {
  let removed: FamilyMember | undefined;
  updateHealthStore(store => {
    removed = store.familyMembers.find(member => member.id === memberId);
    if (!removed || removed.isDefault || store.familyMembers.length <= 1) return store;
    const familyMembers = store.familyMembers.filter(member => member.id !== memberId);
    const fallbackMemberId = familyMembers[0]?.id || 'member_self';
    return {
      ...store,
      activeMemberId: store.activeMemberId === memberId ? fallbackMemberId : store.activeMemberId,
      familyMembers,
      medicines: store.medicines.filter(item => item.memberId !== memberId),
      reminders: store.reminders.filter(item => item.memberId !== memberId),
      timeline: store.timeline.filter(item => item.memberId !== memberId),
      reports: store.reports.filter(item => item.memberId !== memberId),
      visitPreps: store.visitPreps.filter(item => item.memberId !== memberId),
    };
  });
}

export function deleteMedicineReminder(reminderId: string): MedicineReminderRecord | null {
  let removed: MedicineReminderRecord | null = null;
  updateHealthStore(store => {
    removed = store.reminders.find(item => item.id === reminderId) || null;
    return { ...store, reminders: store.reminders.filter(item => item.id !== reminderId) };
  });

  if (removed) {
    addTimelineEvent({
      memberId: removed.memberId,
      type: 'reminder',
      title: `Deleted reminder: ${removed.title}`,
      severity: 'warning',
      source: 'medicine_cabinet',
      metadata: { reminderId },
    });
  }

  return removed;
}

export function setMedicineReminderEnabled(reminderId: string, enabled: boolean): MedicineReminderRecord | null {
  let updated: MedicineReminderRecord | null = null;
  updateHealthStore(store => {
    const reminders = store.reminders.map(item => {
      if (item.id !== reminderId) return item;
      updated = { ...item, enabled, updatedAt: now() };
      return updated;
    });
    return { ...store, reminders };
  });

  if (updated) {
    addTimelineEvent({
      memberId: updated.memberId,
      type: 'reminder',
      title: `${enabled ? 'Enabled' : 'Paused'} reminder: ${updated.title}`,
      description: `Scheduled for ${updated.time}`,
      severity: 'info',
      source: 'medicine_cabinet',
      metadata: { reminderId, enabled },
    });
  }

  return updated;
}

export function recordMedicineTaken(medicineId: string): MedicineCabinetItem | null {
  let updated: MedicineCabinetItem | null = null;
  updateHealthStore(store => {
    const medicines = store.medicines.map(item => {
      if (item.id !== medicineId) return item;
      const nextStock = typeof item.stockCount === 'number' ? Math.max(0, item.stockCount - 1) : undefined;
      updated = { ...item, stockCount: nextStock, updatedAt: now() };
      return updated;
    });
    return { ...store, medicines };
  });

  if (updated) {
    addTimelineEvent({
      memberId: updated.memberId,
      type: 'medicine',
      title: `Took ${updated.name}`,
      description: [
        updated.dosage,
        updated.strength,
        typeof updated.stockCount === 'number' ? `${updated.stockCount} left` : null,
      ].filter(Boolean).join(' | ') || undefined,
      severity: typeof updated.stockCount === 'number' && updated.stockCount <= 3 ? 'warning' : 'normal',
      source: 'medicine_cabinet',
      metadata: { medicineId: updated.id },
    });
  }

  return updated;
}

export function upsertReport(
  report: Partial<HealthReportRecord> & Pick<HealthReportRecord, 'title'>
): HealthReportRecord {
  const timestamp = now();
  let saved: HealthReportRecord;

  updateHealthStore(store => {
    const existing = report.id ? store.reports.find(item => item.id === report.id) : undefined;
    saved = {
      id: report.id || existing?.id || createHealthId('report'),
      memberId: report.memberId || existing?.memberId || store.activeMemberId,
      title: report.title.trim(),
      reportType: report.reportType?.trim() || existing?.reportType,
      capturedAt: report.capturedAt || existing?.capturedAt || timestamp,
      sourceFileName: report.sourceFileName || existing?.sourceFileName,
      extractedText: report.extractedText || existing?.extractedText,
      extractedValues: report.extractedValues || existing?.extractedValues || [],
      summary: report.summary || existing?.summary,
      confidence: report.confidence || existing?.confidence || 'medium',
      originalName: report.originalName || existing?.originalName,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };

    const reports = existing
      ? store.reports.map(item => item.id === saved.id ? saved : item)
      : [saved, ...store.reports];

    return { ...store, reports };
  });

  addTimelineEvent({
    memberId: saved!.memberId,
    type: 'report',
    title: `Report saved: ${saved!.title}`,
    description: saved!.summary,
    severity: saved!.extractedValues?.some(value => value.status === 'critical' || value.status === 'high' || value.status === 'low') ? 'warning' : 'info',
    source: 'report_scanner',
    metadata: { reportId: saved!.id },
  });

  return saved!;
}

export function deleteReport(reportId: string): void {
  updateHealthStore(store => ({
    ...store,
    reports: store.reports.filter(item => item.id !== reportId),
  }));
}

export function getMemberReports(memberId?: string): HealthReportRecord[] {
  const store = loadHealthStore();
  const targetMemberId = memberId || store.activeMemberId;
  return store.reports
    .filter(item => item.memberId === targetMemberId)
    .sort((a, b) => b.capturedAt - a.capturedAt);
}

export function upsertVisitPrep(
  visitPrep: Partial<VisitPrepRecord> & Pick<VisitPrepRecord, 'title' | 'visitReason' | 'summary'>
): VisitPrepRecord {
  const timestamp = now();
  let saved: VisitPrepRecord;

  updateHealthStore(store => {
    const existing = visitPrep.id ? store.visitPreps.find(item => item.id === visitPrep.id) : undefined;
    saved = {
      id: visitPrep.id || existing?.id || createHealthId('visit'),
      memberId: visitPrep.memberId || existing?.memberId || store.activeMemberId,
      title: visitPrep.title.trim(),
      visitReason: visitPrep.visitReason.trim(),
      doctorOrSpecialty: visitPrep.doctorOrSpecialty?.trim() || existing?.doctorOrSpecialty,
      generatedAt: visitPrep.generatedAt || timestamp,
      summary: visitPrep.summary,
      questions: visitPrep.questions || existing?.questions || [],
      redFlags: visitPrep.redFlags || existing?.redFlags || [],
      sourceEventIds: visitPrep.sourceEventIds || existing?.sourceEventIds || [],
      pdfName: visitPrep.pdfName || existing?.pdfName,
    };

    const visitPreps = existing
      ? store.visitPreps.map(item => item.id === saved.id ? saved : item)
      : [saved, ...store.visitPreps];

    return { ...store, visitPreps };
  });

  addTimelineEvent({
    memberId: saved!.memberId,
    type: 'visit_prep',
    title: `Visit prep generated: ${saved!.title}`,
    description: saved!.doctorOrSpecialty || saved!.visitReason,
    severity: 'info',
    source: 'visit_prep',
    metadata: { visitPrepId: saved!.id },
  });

  return saved!;
}

export function getMemberVisitPreps(memberId?: string): VisitPrepRecord[] {
  const store = loadHealthStore();
  const targetMemberId = memberId || store.activeMemberId;
  return store.visitPreps
    .filter(item => item.memberId === targetMemberId)
    .sort((a, b) => b.generatedAt - a.generatedAt);
}

export function buildVisitPrepContext(memberId?: string, days = 30): string {
  const store = loadHealthStore();
  const targetMemberId = memberId || store.activeMemberId;
  const member = store.familyMembers.find(item => item.id === targetMemberId) || getActiveMember(store);
  const since = now() - days * 86400000;
  const medicines = getMemberMedicines(targetMemberId).filter(item => item.status === 'active');
  const reports = getMemberReports(targetMemberId).filter(item => item.capturedAt >= since).slice(0, 5);
  const timeline = listTimelineEvents({ memberId: targetMemberId }).filter(item => item.timestamp >= since).slice(0, 25);

  return [
    `Patient: ${member.name} (${member.relation})`,
    member.age ? `Age: ${member.age}` : '',
    member.sex ? `Sex: ${member.sex}` : '',
    member.conditions?.length ? `Known conditions: ${member.conditions.join(', ')}` : '',
    member.allergies?.length ? `Allergies: ${member.allergies.join(', ')}` : '',
    '',
    'Current medicines:',
    medicines.length
      ? medicines.map(item => `- ${item.name}${item.strength ? ` ${item.strength}` : ''}${item.dosage ? `, ${item.dosage}` : ''}${item.frequency ? `, ${item.frequency}` : ''}`).join('\n')
      : '- None recorded',
    '',
    'Recent reports:',
    reports.length
      ? reports.map(item => `- ${item.title}: ${item.summary || 'No summary'}`).join('\n')
      : '- None recorded',
    '',
    'Recent timeline:',
    timeline.length
      ? timeline.map(item => `- ${new Date(item.timestamp).toLocaleDateString('en-IN')}: ${item.title}${item.description ? ` - ${item.description}` : ''}`).join('\n')
      : '- No recent timeline events',
  ].filter(line => line !== '').join('\n');
}
