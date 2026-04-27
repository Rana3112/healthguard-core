import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    HeartHandshake,
    Pill,
    Plus,
    Shield,
    Stethoscope,
    Trash2,
    UserRound,
    Users,
    X,
} from 'lucide-react';
import {
    deleteFamilyMember,
    getMemberMedicines,
    getMemberReports,
    listTimelineEvents,
    loadHealthStore,
    setActiveFamilyMember,
    upsertFamilyMember,
} from '../src/lib/healthStore';
import type { FamilyMember } from '../src/lib/healthStore';

type MemberForm = {
    id?: string;
    name: string;
    relation: string;
    age: string;
    sex: string;
    conditions: string;
    allergies: string;
    emergencyContact: string;
};

const EMPTY_FORM: MemberForm = {
    name: '',
    relation: '',
    age: '',
    sex: '',
    conditions: '',
    allergies: '',
    emergencyContact: '',
};

function splitCsv(value: string): string[] {
    return value.split(',').map(item => item.trim()).filter(Boolean);
}

function formFromMember(member: FamilyMember): MemberForm {
    return {
        id: member.id,
        name: member.name,
        relation: member.relation,
        age: member.age || '',
        sex: member.sex || '',
        conditions: member.conditions?.join(', ') || '',
        allergies: member.allergies?.join(', ') || '',
        emergencyContact: member.emergencyContact || '',
    };
}

const FamilyCaregiverPanel: React.FC = () => {
    const [refreshKey, setRefreshKey] = useState(0);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<MemberForm>(EMPTY_FORM);

    useEffect(() => {
        const refresh = () => setRefreshKey(key => key + 1);
        window.addEventListener('healthguard:health-store-updated', refresh);
        return () => window.removeEventListener('healthguard:health-store-updated', refresh);
    }, []);

    const store = useMemo(() => loadHealthStore(), [refreshKey]);
    const activeMember = store.familyMembers.find(member => member.id === store.activeMemberId) || store.familyMembers[0];

    const saveMember = (event: React.FormEvent) => {
        event.preventDefault();
        if (!form.name.trim()) return;
        upsertFamilyMember({
            id: form.id,
            name: form.name,
            relation: form.relation || 'Family',
            age: form.age,
            sex: form.sex,
            conditions: splitCsv(form.conditions),
            allergies: splitCsv(form.allergies),
            emergencyContact: form.emergencyContact,
        });
        setForm(EMPTY_FORM);
        setShowForm(false);
    };

    const editMember = (member: FamilyMember) => {
        setForm(formFromMember(member));
        setShowForm(true);
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-[#0f1628] overflow-hidden">
            <div className="flex-1 overflow-y-auto">
                <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500" />

                <div className="px-5 pt-5 pb-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="mb-2 flex items-center gap-2.5">
                                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-500/20">
                                    <Users className="h-4 w-4 text-white" />
                                </div>
                                <h2 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white">Family Care</h2>
                            </div>
                            <p className="text-xs leading-relaxed text-slate-400">Manage health records separately for self, parents, children, and caregivers.</p>
                        </div>
                        <button onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-teal-500/20">
                            <Plus className="h-3.5 w-3.5" /> Add
                        </button>
                    </div>
                </div>

                {activeMember && (
                    <div className="mx-5 mb-4 rounded-xl border border-teal-100 bg-teal-50 p-4 dark:border-teal-800/30 dark:bg-teal-900/10">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-teal-600 shadow-sm dark:bg-slate-800 dark:text-teal-400">
                                <UserRound className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-extrabold text-slate-800 dark:text-white">{activeMember.name}</p>
                                <p className="text-xs text-teal-600 dark:text-teal-300">{activeMember.relation} is the active profile</p>
                            </div>
                        </div>
                    </div>
                )}

                {showForm && (
                    <form onSubmit={saveMember} className="mx-5 mb-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700/50 dark:bg-[#1a2240]">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-xs font-extrabold text-slate-700 dark:text-white">{form.id ? 'Edit profile' : 'Add family member'}</h3>
                            <button type="button" onClick={() => setShowForm(false)} className="p-1 text-slate-400 hover:text-red-400">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            <input value={form.name} onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Name" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            <div className="grid grid-cols-2 gap-2">
                                <input value={form.relation} onChange={event => setForm(prev => ({ ...prev, relation: event.target.value }))} placeholder="Relation" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                                <input value={form.age} onChange={event => setForm(prev => ({ ...prev, age: event.target.value }))} placeholder="Age" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            </div>
                            <input value={form.sex} onChange={event => setForm(prev => ({ ...prev, sex: event.target.value }))} placeholder="Sex / gender" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            <input value={form.conditions} onChange={event => setForm(prev => ({ ...prev, conditions: event.target.value }))} placeholder="Conditions, comma-separated" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            <input value={form.allergies} onChange={event => setForm(prev => ({ ...prev, allergies: event.target.value }))} placeholder="Allergies, comma-separated" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            <input value={form.emergencyContact} onChange={event => setForm(prev => ({ ...prev, emergencyContact: event.target.value }))} placeholder="Emergency contact" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                        </div>
                        <button disabled={!form.name.trim()} className="mt-3 w-full rounded-lg bg-teal-600 py-2.5 text-xs font-bold text-white disabled:opacity-50">Save Profile</button>
                    </form>
                )}

                <div className="px-5 space-y-3 pb-6">
                    {store.familyMembers.map(member => {
                        const meds = getMemberMedicines(member.id).filter(item => item.status === 'active');
                        const reports = getMemberReports(member.id);
                        const warnings = listTimelineEvents({ memberId: member.id, includeVitals: true }).filter(event => event.severity === 'warning' || event.severity === 'critical');
                        const isActive = member.id === store.activeMemberId;
                        return (
                            <div key={member.id} className={`rounded-xl border p-4 shadow-sm ${isActive ? 'border-teal-200 bg-teal-50 dark:border-teal-800/30 dark:bg-teal-900/10' : 'border-slate-100 bg-white dark:border-slate-700/50 dark:bg-[#1a2240]'}`}>
                                <div className="flex items-start gap-3">
                                    <button onClick={() => setActiveFamilyMember(member.id)} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isActive ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                                        <UserRound className="h-5 w-5" />
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="break-words text-sm font-extrabold text-slate-800 dark:text-white">{member.name}</p>
                                                <p className="text-[11px] text-slate-400">{member.relation}{member.age ? ` | ${member.age} yrs` : ''}{member.sex ? ` | ${member.sex}` : ''}</p>
                                            </div>
                                            <button onClick={() => editMember(member)} className="rounded-lg px-2 py-1 text-[10px] font-bold text-teal-600 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-900/20">Edit</button>
                                        </div>

                                        <div className="mt-3 grid grid-cols-3 gap-2">
                                            <div className="rounded-lg bg-white/70 p-2 dark:bg-slate-800/50">
                                                <Pill className="mb-1 h-3.5 w-3.5 text-teal-500" />
                                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{meds.length} meds</p>
                                            </div>
                                            <div className="rounded-lg bg-white/70 p-2 dark:bg-slate-800/50">
                                                <Stethoscope className="mb-1 h-3.5 w-3.5 text-blue-500" />
                                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{reports.length} reports</p>
                                            </div>
                                            <div className="rounded-lg bg-white/70 p-2 dark:bg-slate-800/50">
                                                {warnings.length ? <AlertTriangle className="mb-1 h-3.5 w-3.5 text-amber-500" /> : <Shield className="mb-1 h-3.5 w-3.5 text-emerald-500" />}
                                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{warnings.length} alerts</p>
                                            </div>
                                        </div>

                                        {(member.conditions?.length || member.allergies?.length) && (
                                            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                                                {member.conditions?.length ? <p><span className="font-bold">Conditions:</span> {member.conditions.join(', ')}</p> : null}
                                                {member.allergies?.length ? <p><span className="font-bold">Allergies:</span> {member.allergies.join(', ')}</p> : null}
                                            </div>
                                        )}

                                        {member.emergencyContact && (
                                            <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-rose-500">
                                                <HeartHandshake className="h-3.5 w-3.5" /> Emergency: {member.emergencyContact}
                                            </p>
                                        )}

                                        {!member.isDefault && (
                                            <button onClick={() => deleteFamilyMember(member.id)} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-[10px] font-bold text-red-500 dark:bg-red-900/15">
                                                <Trash2 className="h-3.5 w-3.5" /> Remove profile
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default FamilyCaregiverPanel;
