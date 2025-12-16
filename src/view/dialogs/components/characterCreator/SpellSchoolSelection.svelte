<script>
	import { getContext } from 'svelte';
	import Hint from '../../../components/Hint.svelte';

	let {
		active,
		selectedClass,
		classFeatures = [],
		spellSchoolSelections = $bindable({}),
	} = $props();

	const CHARACTER_CREATION_STAGES = getContext('CHARACTER_CREATION_STAGES');
	const dialog = getContext('dialog');

	const hintText =
		'Your class grants you access to certain spell schools. Some schools are automatically granted, while others require you to make a choice.';

	// Helper to get rules from a loaded document's source data
	function getRulesFromDocument(doc) {
		if (!doc) return [];

		// For documents loaded via fromUuid, _source.system.rules has the raw data
		if (doc._source?.system?.rules?.length > 0) {
			return doc._source.system.rules;
		}
		// Fallback to system.rules
		if (doc.system?.rules?.length > 0) {
			return doc.system.rules;
		}
		// Try the rules Map (for fully prepared embedded documents)
		if (doc.rules?.size > 0) {
			return [...doc.rules.values()];
		}
		return [];
	}

	// Store loaded rules in state - loaded asynchronously
	let selectSpellSchoolRules = $state([]);

	// Load rules when selectedClass or classFeatures change
	$effect(() => {
		const currentClass = selectedClass;
		const currentFeatures = classFeatures;

		async function loadRules() {
			if (!currentClass?.uuid) {
				selectSpellSchoolRules = [];
				return;
			}

			const rules = [];

			// Load and check class document
			try {
				const classDoc = await fromUuid(currentClass.uuid);
				if (classDoc) {
					for (const rule of getRulesFromDocument(classDoc)) {
						if (rule.type === 'selectSpellSchool' && rule.choiceCount > 0) {
							rules.push({
								...rule,
								source: classDoc.name,
								sourceItem: classDoc,
							});
						}
					}
				}
			} catch (err) {
				console.warn('Failed to load class document:', err);
			}

			// Load and check class feature documents
			for (const feature of currentFeatures) {
				if (!feature?.uuid) continue;

				try {
					const featureDoc = await fromUuid(feature.uuid);
					if (featureDoc) {
						for (const rule of getRulesFromDocument(featureDoc)) {
							if (rule.type === 'selectSpellSchool' && rule.choiceCount > 0) {
								rules.push({
									...rule,
									source: featureDoc.name,
									sourceItem: featureDoc,
								});
							}
						}
					}
				} catch (err) {
					console.warn('Failed to load feature document:', err);
				}
			}

			selectSpellSchoolRules = rules;
		}

		loadRules();
	});

	// Check if all selections have been made
	let allSelectionsComplete = $derived.by(() => {
		for (const rule of selectSpellSchoolRules) {
			const selections = spellSchoolSelections[rule.id] ?? [];
			if (selections.length < rule.choiceCount) {
				return false;
			}
		}
		return true;
	});

	// School display names
	const schoolLabels = {
		fire: 'Fire',
		ice: 'Ice',
		lightning: 'Lightning',
		wind: 'Wind',
		radiant: 'Radiant',
		necrotic: 'Necrotic',
	};

	// School icons (matching CONFIG.NIMBLE.spellSchoolIcons)
	const schoolIcons = {
		fire: 'fa-solid fa-fire-flame-curved',
		ice: 'fa-solid fa-snowflake',
		lightning: 'fa-solid fa-bolt-lightning',
		wind: 'fa-solid fa-wind',
		radiant: 'fa-solid fa-sun',
		necrotic: 'fa-solid fa-skull',
	};

	function handleSchoolSelect(ruleId, school) {
		const current = spellSchoolSelections[ruleId] ?? [];
		const rule = selectSpellSchoolRules.find((r) => r.id === ruleId);
		if (!rule) return;

		if (current.includes(school)) {
			// Remove selection
			spellSchoolSelections = {
				...spellSchoolSelections,
				[ruleId]: current.filter((s) => s !== school),
			};
		} else if (current.length < rule.choiceCount) {
			// Add selection
			spellSchoolSelections = {
				...spellSchoolSelections,
				[ruleId]: [...current, school],
			};
		}
	}
</script>

{#if selectSpellSchoolRules.length > 0}
	<section
		class="nimble-character-creation-section"
		id="{dialog.id}-stage-{CHARACTER_CREATION_STAGES.SPELL_SCHOOLS}"
	>
		<header class="nimble-section-header" data-header-variant="character-creator">
			<h3 class="nimble-heading" data-heading-variant="section">
				Spell School Selection

				{#if !active && allSelectionsComplete}
					<button
						class="nimble-button"
						data-button-variant="icon"
						aria-label="Edit Spell School Selection"
						data-tooltip="Edit Spell School Selection"
						onclick={() => {
							spellSchoolSelections = {};
						}}
					>
						<i class="fa-solid fa-edit"></i>
					</button>
				{/if}
			</h3>
		</header>

		{#if active}
			<Hint {hintText} />

			{#each selectSpellSchoolRules as rule (rule.id)}
				<div class="nimble-spell-school-selection">
					<h4 class="nimble-heading" data-heading-variant="subsection">
						{rule.label || 'Choose Spell Schools'}
						<span class="nimble-spell-school-selection__source">({rule.source})</span>
					</h4>

					{#if rule.fixedSchools.length > 0}
						<div class="nimble-spell-school-selection__fixed">
							<span class="nimble-spell-school-selection__label">Granted:</span>
							{#each rule.fixedSchools as school}
								<span class="nimble-tag" data-tag-variant="school">
									<i class="{schoolIcons[school]} nimble-tag__icon"></i>
									{schoolLabels[school] || school}
								</span>
							{/each}
						</div>
					{/if}

					<div class="nimble-spell-school-selection__choices">
						<span class="nimble-spell-school-selection__label">
							Choose {rule.choiceCount}:
						</span>
						<div class="nimble-spell-school-selection__options">
							{#each rule.choiceOptions as school}
								{@const isSelected = (spellSchoolSelections[rule.id] ?? []).includes(school)}
								{@const currentCount = (spellSchoolSelections[rule.id] ?? []).length}
								{@const isDisabled = !isSelected && currentCount >= rule.choiceCount}
								<button
									class="nimble-button nimble-spell-school-option"
									class:selected={isSelected}
									disabled={isDisabled}
									onclick={() => handleSchoolSelect(rule.id, school)}
								>
									<i class="{schoolIcons[school]} nimble-spell-school-option__icon"></i>
									{schoolLabels[school] || school}
									{#if isSelected}
										<i class="fa-solid fa-check nimble-spell-school-option__check"></i>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				</div>
			{/each}
		{:else if allSelectionsComplete}
			<div class="nimble-spell-school-selection__summary">
				{#each selectSpellSchoolRules as rule (rule.id)}
					<div class="nimble-spell-school-selection__summary-item">
						<span class="nimble-spell-school-selection__label">{rule.label}:</span>
						{#each rule.fixedSchools as school}
							<span class="nimble-tag" data-tag-variant="school">
								<i class="{schoolIcons[school]} nimble-tag__icon"></i>
								{schoolLabels[school] || school}
							</span>
						{/each}
						{#each spellSchoolSelections[rule.id] ?? [] as school}
							<span class="nimble-tag" data-tag-variant="school-selected">
								<i class="{schoolIcons[school]} nimble-tag__icon"></i>
								{schoolLabels[school] || school}
							</span>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
	</section>
{/if}

<style lang="scss">
	.nimble-spell-school-selection {
		padding: 1rem;
		background: var(--nimble-surface-2);
		border-radius: var(--nimble-border-radius);
		margin-block: 0.5rem;

		&__source {
			font-weight: normal;
			font-size: var(--nimble-sm-text);
			color: var(--nimble-text-secondary);
		}

		&__fixed,
		&__choices {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			flex-wrap: wrap;
			margin-block: 0.5rem;
		}

		&__label {
			font-weight: 600;
			min-width: 6rem;
		}

		&__options {
			display: flex;
			gap: 0.5rem;
			flex-wrap: wrap;
		}

		&__summary {
			padding: 1rem;
		}

		&__summary-item {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			margin-block: 0.25rem;
		}
	}

	.nimble-spell-school-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border: 2px solid var(--nimble-border-color);
		border-radius: var(--nimble-border-radius);
		background: var(--nimble-surface-1);
		cursor: pointer;
		transition: all 0.2s ease;

		&:hover:not(:disabled) {
			border-color: var(--nimble-accent-color);
		}

		&.selected {
			border-color: var(--nimble-accent-color);
			background: var(--nimble-accent-color);
			color: var(--nimble-text-on-accent);
		}

		&:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		&__icon {
			font-size: 1rem;
			width: 1.25rem;
			text-align: center;
		}

		&__check {
			margin-left: 0.25rem;
		}
	}

	.nimble-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		border-radius: var(--nimble-border-radius);
		font-size: var(--nimble-sm-text);

		&__icon {
			font-size: 0.875rem;
			width: 1rem;
			text-align: center;
		}

		&[data-tag-variant='school'] {
			background: var(--nimble-surface-3);
		}

		&[data-tag-variant='school-selected'] {
			background: var(--nimble-accent-color);
			color: var(--nimble-text-on-accent);
		}
	}
</style>
