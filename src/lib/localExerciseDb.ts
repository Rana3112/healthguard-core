import exerciseDbUrl from "../../backend/data/exercises.json?url";

const IMAGE_BASE_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

type RawExercise = {
  id?: string | number;
  name?: string;
  category?: string;
  equipment?: string;
  gifUrl?: string;
  images?: string[];
  instructions?: string[];
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
};

export interface BundledExerciseResult {
  id: string;
  name: string;
  target: string;
  bodyPart: string;
  equipment: string;
  gifUrl: string;
  secondaryMuscles: string[];
  instructions: string[];
}

const QUERY_MUSCLE_KEYWORDS: Record<string, string[]> = {
  abs: ["abdominals", "abs", "core", "obliques", "waist"],
  abdominal: ["abdominals", "abs", "core", "obliques", "waist"],
  core: ["abdominals", "abs", "core", "obliques", "waist"],
  stomach: ["abdominals", "abs", "core", "obliques", "waist"],
  belly: ["abdominals", "abs", "core", "obliques", "waist"],
  chest: ["pectorals", "chest", "pectoralis"],
  pecs: ["pectorals", "chest", "pectoralis"],
  back: [
    "latissimus dorsi",
    "lats",
    "middle back",
    "lower back",
    "upper back",
    "traps",
  ],
  lats: ["latissimus dorsi", "lats"],
  biceps: ["biceps", "bicep"],
  triceps: ["triceps", "tricep"],
  shoulders: ["shoulders", "deltoids", "delts"],
  legs: ["quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors"],
  leg: ["quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors"],
  thigh: ["quadriceps", "hamstrings", "adductors"],
  thighs: ["quadriceps", "hamstrings", "adductors"],
  quads: ["quadriceps", "quad"],
  quad: ["quadriceps"],
  hamstring: ["hamstrings"],
  hamstrings: ["hamstrings"],
  glutes: ["glutes", "gluteus", "butt"],
  butt: ["glutes", "gluteus"],
  calves: ["calves", "calf"],
  calf: ["calves"],
  arms: ["biceps", "triceps", "forearms"],
  forearms: ["forearms", "forearm"],
  neck: ["neck"],
  traps: ["trapezius", "traps"],
  trapezius: ["trapezius", "traps"],
  "lower back": ["lower back"],
  "upper back": ["upper back"],
};

const TARGET_ALIASES: Record<string, string[]> = {
  chest: ["pectorals", "chest"],
  back: ["latissimus dorsi", "lats", "middle back", "lower back", "upper back", "traps"],
  legs: ["quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors"],
  arms: ["biceps", "triceps", "forearms"],
  shoulders: ["shoulders", "deltoids", "delts"],
  abs: ["abdominals", "abs", "core"],
  core: ["abdominals", "abs", "core"],
  cardio: ["cardiovascular system"],
};

let bundledExerciseDbPromise: Promise<RawExercise[]> | null = null;

function normalizeText(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

async function loadBundledExerciseDb(): Promise<RawExercise[]> {
  if (!bundledExerciseDbPromise) {
    bundledExerciseDbPromise = fetch(exerciseDbUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load bundled exercise DB: ${response.status}`);
        }

        const data = await response.json();
        return Array.isArray(data) ? (data as RawExercise[]) : [];
      })
      .catch((error) => {
        bundledExerciseDbPromise = null;
        throw error;
      });
  }

  return bundledExerciseDbPromise;
}

function getGifUrl(exercise: RawExercise): string {
  if (exercise.gifUrl) {
    return exercise.gifUrl;
  }

  if (exercise.images && exercise.images.length > 0) {
    return `${IMAGE_BASE_URL}${exercise.images[0]}`;
  }

  return "";
}

function formatExercise(
  exercise: RawExercise,
  requestedTarget?: string
): BundledExerciseResult {
  return {
    id: String(exercise.id || `${exercise.name || "exercise"}-${Math.random().toString(36).slice(2, 10)}`),
    name: exercise.name || "Exercise",
    target: requestedTarget || exercise.primaryMuscles?.[0] || "unknown",
    bodyPart: exercise.category || "strength",
    equipment: exercise.equipment || "body weight",
    gifUrl: getGifUrl(exercise),
    secondaryMuscles: exercise.secondaryMuscles || [],
    instructions: exercise.instructions || [],
  };
}

function getAllMuscles(exercise: RawExercise): string[] {
  return [
    ...(exercise.primaryMuscles || []),
    ...(exercise.secondaryMuscles || []),
  ].map((muscle) => normalizeText(muscle));
}

function getTargetSearchTerms(target: string): string[] {
  const normalizedTarget = normalizeText(target);
  const aliases = TARGET_ALIASES[normalizedTarget] || [];

  return Array.from(new Set([normalizedTarget, ...aliases.map((alias) => normalizeText(alias))]));
}

export async function getBundledMuscles(): Promise<string[]> {
  const exerciseDb = await loadBundledExerciseDb();
  const muscles = new Set<string>();

  for (const exercise of exerciseDb) {
    for (const muscle of exercise.primaryMuscles || []) {
      if (muscle) {
        muscles.add(muscle);
      }
    }
  }

  return Array.from(muscles).sort((a, b) => a.localeCompare(b));
}

export async function getBundledEquipment(): Promise<string[]> {
  const exerciseDb = await loadBundledExerciseDb();
  const equipment = new Set<string>();

  for (const exercise of exerciseDb) {
    if (exercise.equipment) {
      equipment.add(exercise.equipment);
    }
  }

  return Array.from(equipment).sort((a, b) => a.localeCompare(b));
}

export async function getBundledExercisesByTarget(
  target: string,
  equipment = ""
): Promise<BundledExerciseResult[]> {
  const exerciseDb = await loadBundledExerciseDb();
  const equipmentFilter = normalizeText(equipment);
  const targetTerms = getTargetSearchTerms(target);

  return exerciseDb
    .filter((exercise) => {
      const primaryMuscles = (exercise.primaryMuscles || []).map((muscle) =>
        normalizeText(muscle)
      );

      const matchesTarget = targetTerms.some((term) =>
        primaryMuscles.some((muscle) => muscle.includes(term) || term.includes(muscle))
      );

      if (!matchesTarget) {
        return false;
      }

      if (equipmentFilter && normalizeText(exercise.equipment) !== equipmentFilter) {
        return false;
      }

      return true;
    })
    .map((exercise) => formatExercise(exercise, target));
}

export async function searchBundledExercises(
  query: string,
  limit = 8
): Promise<BundledExerciseResult[]> {
  const exerciseDb = await loadBundledExerciseDb();
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return [];
  }

  const targetMuscles = new Set<string>();
  for (const [keyword, muscles] of Object.entries(QUERY_MUSCLE_KEYWORDS)) {
    if (normalizedQuery.includes(keyword)) {
      for (const muscle of muscles) {
        targetMuscles.add(normalizeText(muscle));
      }
    }
  }

  const matches: RawExercise[] = [];

  if (targetMuscles.size === 0) {
    for (const exercise of exerciseDb) {
      if (normalizeText(exercise.name).includes(normalizedQuery)) {
        matches.push(exercise);
      }

      if (matches.length >= limit) {
        break;
      }
    }
  } else {
    for (const exercise of exerciseDb) {
      const muscles = getAllMuscles(exercise);
      const hasTargetMatch = Array.from(targetMuscles).some((target) =>
        muscles.some((muscle) => muscle.includes(target) || target.includes(muscle))
      );

      if (hasTargetMatch) {
        matches.push(exercise);
      }

      if (matches.length >= limit) {
        break;
      }
    }
  }

  return matches.slice(0, limit).map((exercise) => formatExercise(exercise));
}
