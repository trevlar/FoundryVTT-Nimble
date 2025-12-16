import getSpellsBySchoolAndTier, {
	type GetSpellsOptions,
	type SpellInfo,
} from './getSpellsBySchoolAndTier.js';

function getActorClassIdentifiers(actor: NimbleCharacterActor): string[] {
	const classData = actor.system as { classData?: { levels?: string[] } };
	const levels = classData.classData?.levels ?? [];
	return Array.from(
		new Set(levels.filter((c): c is string => typeof c === 'string' && c.length > 0)),
	);
}

/**
 * Get spells that a character doesn't already have, filtered by schools and tier
 * @param actor - The character actor to check
 * @param options - Filter options for schools, max tier, and utility type
 * @returns Array of spell info objects that the character is missing
 */
export default async function getCharacterMissingSpells(
	actor: NimbleCharacterActor,
	options: GetSpellsOptions,
): Promise<SpellInfo[]> {
	// Get all spells matching the criteria
	const allSpells = await getSpellsBySchoolAndTier({
		...options,
		allowedClasses: getActorClassIdentifiers(actor),
	});

	// Get the sourceIds of spells the character already has
	const existingSourceIds = new Set<string>();
	for (const item of actor.items) {
		if (item.type !== 'spell') continue;

		const spell = item as NimbleSpellItem;
		const sourceId = spell.sourceId;
		if (sourceId) {
			existingSourceIds.add(sourceId);
		}
	}

	// Filter out spells the character already has
	return allSpells.filter((spell) => !existingSourceIds.has(spell.uuid));
}
