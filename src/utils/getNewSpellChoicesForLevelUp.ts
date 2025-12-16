interface SpellChoiceInfo {
	ruleId: string;
	sourceFeature: string;
	sourceItemId: string;
	label: string;
	spellType: 'utility' | 'tiered' | 'any';
	schoolSource: 'known' | 'specific' | 'any';
	schools: string[];
	maxTier: number;
	newChoiceCount: number;
	totalChoiceCount: number;
	currentSelections: string[];
}

/**
 * Detects spell choices that need to be made when a character levels up.
 * This checks all selectSpell rules on the character's items and finds
 * rules that have levelProgression entries for the new level.
 *
 * @param actor - The character actor
 * @param newLevel - The level the character is advancing to
 * @returns Array of spell choice info objects
 */
export default function getNewSpellChoicesForLevelUp(
	actor: NimbleCharacterActor,
	newLevel: number,
): SpellChoiceInfo[] {
	const results: SpellChoiceInfo[] = [];

	if (!actor || actor.type !== 'character') return results;

	// Find all items with selectSpell rules
	for (const item of actor.items) {
		const rules = item.system?.rules ?? [];

		for (const rule of rules) {
			if (rule.type !== 'selectSpell') continue;
			if (rule.disabled) continue;

			// Check if this level unlocks new choices
			const levelProgression = rule.levelProgression ?? {};
			const newChoices = levelProgression[newLevel.toString()] ?? 0;

			if (newChoices === 0) continue;

			// Calculate total choices available at this level
			let totalChoices = rule.baseChoiceCount ?? 0;
			for (const [levelStr, count] of Object.entries(levelProgression)) {
				const level = parseInt(levelStr, 10);
				if (newLevel >= level) {
					totalChoices += count as number;
				}
			}

			// Get current selections
			const currentSelections = rule.chosenSpells ?? [];

			// Only add if there are unfilled slots
			if (currentSelections.length < totalChoices) {
				results.push({
					ruleId: rule.id,
					sourceFeature: item.name ?? 'Unknown Feature',
					sourceItemId: item.id ?? '',
					label: rule.label ?? 'Choose Spells',
					spellType: rule.spellType ?? 'any',
					schoolSource: rule.schoolSource ?? 'any',
					schools: rule.schools ?? [],
					maxTier: rule.maxTier ?? 9,
					newChoiceCount: newChoices,
					totalChoiceCount: totalChoices,
					currentSelections,
				});
			}
		}
	}

	return results;
}
