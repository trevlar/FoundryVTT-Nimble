import getCharacterMissingSpells from './getCharacterMissingSpells.js';
import getClassFeaturesByGroup from './getClassFeaturesByGroup.js';

interface SpellInfo {
	uuid: string;
	name: string;
	img: string;
	school: string;
	tier: number;
	isUtility: boolean;
}

interface NewSpellsResult {
	spells: SpellInfo[];
	sourceFeature: string;
	ruleId: string;
}

interface GetNewSpellsForLevelUpOptions {
	/**
	 * Override the "current" level used for comparison. This is useful when the actor
	 * has already been updated to the new level (e.g., after the level-up dialog commits).
	 */
	currentLevel?: number;

	/**
	 * When true (default), include class features from compendiums that would be active
	 * at `newLevel`, even if the feature item is not embedded on the actor yet.
	 *
	 * This keeps the level-up dialog preview and post-level-up auto-granting in sync
	 * with class progression.
	 */
	includeCompendiumClassFeatures?: boolean;
}

interface GrantSpellSchoolRuleData {
	type: 'grantSpellSchool';
	id: string;
	disabled?: boolean;
	schoolSource?: 'known' | 'specific';
	schools?: string[];
	baseTier?: number;
	tierProgression?: Record<string, number>;
	utilityOnly?: boolean;
	excludeUtility?: boolean;
}

function isGrantSpellSchoolRule(rule: { type?: string }): rule is GrantSpellSchoolRuleData {
	return (
		rule.type === 'grantSpellSchool' &&
		typeof (rule as { id?: string }).id === 'string' &&
		(rule as { id?: string }).id.length > 0
	);
}

function getItemRequiredLevel(item: { system?: { level?: number | string | null } }): number {
	const raw = item.system?.level;
	const asNumber =
		typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;

	return Number.isFinite(asNumber) && asNumber > 0 ? asNumber : 1;
}

function getCompendiumSourceId(item: {
	_stats?: { compendiumSource?: string };
	flags?: { core?: { sourceId?: string } };
}): string | null {
	const source = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
	return typeof source === 'string' && source.length > 0 ? source : null;
}

function getActorClassGroupIdentifiers(actor: NimbleCharacterActor): string[] {
	for (const item of actor.items) {
		if (item.type !== 'class') continue;
		const system = item.system as { groupIdentifiers?: unknown } | undefined;
		const groups = system?.groupIdentifiers;
		if (Array.isArray(groups)) {
			return groups.filter((g): g is string => typeof g === 'string' && g.length > 0);
		}
	}
	return [];
}

async function getCompendiumClassFeaturesAsItems(
	actor: NimbleCharacterActor,
	newLevel: number,
): Promise<
	Array<{ name?: string; system?: { level?: number | string | null; rules?: unknown[] } }>
> {
	// Guard for unit tests / non-Foundry contexts
	if (typeof game === 'undefined' || !game?.packs) return [];
	if (typeof fromUuid !== 'function') return [];

	const groupIdentifiers = getActorClassGroupIdentifiers(actor);
	if (groupIdentifiers.length === 0) return [];

	const featureUuids = await getClassFeaturesByGroup(groupIdentifiers, newLevel);
	if (featureUuids.length === 0) return [];

	const existingSourceIds = new Set<string>();
	for (const item of actor.items) {
		const sourceId = getCompendiumSourceId(item as { _stats?: { compendiumSource?: string } });
		if (sourceId) existingSourceIds.add(sourceId);
	}

	const featureItems: Array<{
		name?: string;
		system?: { level?: number | string | null; rules?: unknown[] };
	}> = [];

	for (const uuid of featureUuids) {
		if (existingSourceIds.has(uuid)) continue;

		const doc = await fromUuid(uuid);
		if (!doc) continue;

		// Only need name + system for rule scanning; use structural typing to avoid casts.
		const maybeItem = doc as {
			name?: string;
			system?: { level?: number | string | null; rules?: unknown[] };
		};
		if (!maybeItem.system?.rules) continue;

		featureItems.push(maybeItem);
	}

	return featureItems;
}

/**
 * Detects spells that should be auto-granted when a character levels up.
 * This checks all grantSpellSchool rules on the character's items and finds
 * spells that are now available due to tier progression.
 *
 * @param actor - The character actor
 * @param newLevel - The level the character is advancing to
 * @returns Array of spell info objects grouped by source feature
 */
export default async function getNewSpellsForLevelUp(
	actor: NimbleCharacterActor,
	newLevel: number,
	options: GetNewSpellsForLevelUpOptions = {},
): Promise<NewSpellsResult[]> {
	const results: NewSpellsResult[] = [];

	if (!actor || actor.type !== 'character') return results;

	const currentLevel = options.currentLevel ?? actor.levels?.character ?? 1;
	const includeCompendiumClassFeatures = options.includeCompendiumClassFeatures ?? true;

	const extraItems = includeCompendiumClassFeatures
		? await getCompendiumClassFeaturesAsItems(actor, newLevel)
		: [];

	// Find all items with grantSpellSchool rules (embedded + relevant compendium class features)
	for (const item of [...actor.items, ...extraItems]) {
		const rules = item.system?.rules ?? [];
		const itemRequiredLevel = getItemRequiredLevel(item);

		for (const rule of rules) {
			if (!isGrantSpellSchoolRule(rule)) continue;
			if (rule.disabled) continue;

			// Calculate the max tier at the current level vs new level
			const currentMaxTier = getEffectiveMaxTierForLevel(rule, itemRequiredLevel, currentLevel);
			const newMaxTier = getEffectiveMaxTierForLevel(rule, itemRequiredLevel, newLevel);

			// If new level doesn't unlock higher tier, skip
			if (newMaxTier <= currentMaxTier) continue;

			// Get schools based on schoolSource
			let schools: string[] = [];
			if (rule.schoolSource === 'known') {
				schools = Object.keys(actor.system.spellAccess?.schools ?? {});
			} else {
				schools = rule.schools ?? [];
			}

			if (schools.length === 0) continue;

			// Find spells in the new tier range
			const missingSpells = await getCharacterMissingSpells(actor, {
				schools,
				maxTier: newMaxTier,
				utilityOnly: rule.utilityOnly ?? false,
				excludeUtility: rule.excludeUtility ?? false,
			});

			// Filter to only spells in tiers > currentMaxTier
			const newSpells = missingSpells.filter((spell) => spell.tier > currentMaxTier);

			if (newSpells.length > 0) {
				results.push({
					spells: newSpells,
					sourceFeature: item.name ?? 'Unknown Feature',
					ruleId: rule.id,
				});
			}
		}
	}

	return results;
}

/**
 * Calculate max tier for a given level based on rule configuration
 */
function getMaxTierForLevel(
	rule: Pick<GrantSpellSchoolRuleData, 'baseTier' | 'tierProgression'>,
	level: number,
): number {
	let maxTier = rule.baseTier ?? 0;

	for (const [levelStr, tier] of Object.entries(rule.tierProgression ?? {})) {
		const requiredLevel = Number.parseInt(levelStr, 10);
		if (!Number.isFinite(requiredLevel)) continue;
		if (level >= requiredLevel && tier > maxTier) {
			maxTier = tier;
		}
	}

	return maxTier;
}

/**
 * Calculate max tier for a given level, respecting when the source feature becomes active.
 * Before the feature's required level, the rule grants nothing (tier -1), which allows
 * tier 0/1 spells to be considered "new" on the level the feature comes online.
 */
function getEffectiveMaxTierForLevel(
	rule: Pick<GrantSpellSchoolRuleData, 'baseTier' | 'tierProgression'>,
	itemRequiredLevel: number,
	level: number,
): number {
	if (level < itemRequiredLevel) return -1;
	return getMaxTierForLevel(rule, level);
}
