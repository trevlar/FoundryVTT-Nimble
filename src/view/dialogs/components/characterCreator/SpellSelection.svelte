<script>
	import { getContext } from 'svelte';
	import Hint from '../../../components/Hint.svelte';
	import getSpellsBySchoolAndTier from '../../../../utils/getSpellsBySchoolAndTier.js';

	let {
		active,
		selectedClass,
		classFeatures = [],
		selectedBackground,
		spellSchoolSelections = {},
		spellSelections = $bindable({}),
	} = $props();

	const CHARACTER_CREATION_STAGES = getContext('CHARACTER_CREATION_STAGES');
	const dialog = getContext('dialog');

	const hintText =
		'Some of your class features or background allow you to choose specific spells. Select from the available options below.';

	// School display names
	const schoolLabels = {
		fire: 'Fire',
		ice: 'Ice',
		lightning: 'Lightning',
		wind: 'Wind',
		radiant: 'Radiant',
		necrotic: 'Necrotic',
	};

	// Helper to get rules from a loaded document's source data
	function getRulesFromDocument(doc) {
		console.log('[SpellSelection] getRulesFromDocument for:', doc?.name);
		console.log(
			'[SpellSelection] - _source.system.rules.length:',
			doc?._source?.system?.rules?.length,
		);
		console.log('[SpellSelection] - system.rules.length:', doc?.system?.rules?.length);
		console.log('[SpellSelection] - rules.size:', doc?.rules?.size);

		if (!doc) return [];

		// For documents loaded via fromUuid, _source.system.rules has the raw data
		if (doc._source?.system?.rules?.length > 0) {
			console.log('[SpellSelection] - Using _source.system.rules');
			return doc._source.system.rules;
		}
		// Fallback to system.rules
		if (doc.system?.rules?.length > 0) {
			console.log('[SpellSelection] - Using system.rules');
			return doc.system.rules;
		}
		// Try the rules Map (for fully prepared embedded documents)
		if (doc.rules?.size > 0) {
			console.log('[SpellSelection] - Using rules Map');
			return [...doc.rules.values()];
		}
		console.log('[SpellSelection] - No rules found');
		return [];
	}

	// Store loaded rules and schools in state - loaded asynchronously
	let selectSpellRules = $state([]);
	let knownSchools = $state([]);

	// Load rules and known schools when dependencies change
	$effect(() => {
		const currentClass = selectedClass;
		const currentFeatures = classFeatures;
		const currentBackground = selectedBackground;
		const currentSpellSchoolSelections = spellSchoolSelections;

		console.log('[SpellSelection] Effect triggered');
		console.log(
			'[SpellSelection] - currentClass:',
			currentClass?.name,
			'uuid:',
			currentClass?.uuid,
		);
		console.log('[SpellSelection] - currentFeatures count:', currentFeatures?.length);
		console.log(
			'[SpellSelection] - currentBackground:',
			currentBackground?.name,
			'uuid:',
			currentBackground?.uuid,
		);

		async function loadRulesAndSchools() {
			console.log('[SpellSelection] loadRulesAndSchools starting...');
			const rules = [];
			const schools = new Set();

			// Load and check class document
			if (currentClass?.uuid) {
				try {
					console.log('[SpellSelection] Loading class from uuid:', currentClass.uuid);
					const classDoc = await fromUuid(currentClass.uuid);
					console.log('[SpellSelection] Loaded class doc:', classDoc?.name);
					if (classDoc) {
						for (const rule of getRulesFromDocument(classDoc)) {
							console.log('[SpellSelection] - Class rule type:', rule.type);
							if (rule.type === 'selectSpell' && rule.baseChoiceCount > 0) {
								console.log('[SpellSelection] Found selectSpell in class');
								rules.push({
									...rule,
									source: classDoc.name,
									sourceItem: classDoc,
								});
							}
							// Collect known schools from grantSpellSchool
							if (rule.type === 'grantSpellSchool') {
								rule.schools?.forEach((s) => schools.add(s.toLowerCase()));
							}
							// Collect known schools from selectSpellSchool
							if (rule.type === 'selectSpellSchool') {
								rule.fixedSchools?.forEach((s) => schools.add(s.toLowerCase()));
								const chosen = currentSpellSchoolSelections[rule.id] ?? [];
								chosen.forEach((s) => schools.add(s.toLowerCase()));
							}
						}
					}
				} catch (err) {
					console.warn('Failed to load class document:', err);
				}
			}

			// Load and check class feature documents
			console.log('[SpellSelection] Loading', currentFeatures?.length, 'features...');
			for (const feature of currentFeatures) {
				if (!feature?.uuid) continue;

				try {
					console.log('[SpellSelection] Loading feature from uuid:', feature.uuid);
					const featureDoc = await fromUuid(feature.uuid);
					console.log('[SpellSelection] Loaded feature doc:', featureDoc?.name);
					if (featureDoc) {
						for (const rule of getRulesFromDocument(featureDoc)) {
							console.log('[SpellSelection] - Feature', featureDoc.name, 'rule type:', rule.type);
							if (rule.type === 'selectSpell' && rule.baseChoiceCount > 0) {
								console.log('[SpellSelection] Found selectSpell in feature:', featureDoc.name);
								rules.push({
									...rule,
									source: featureDoc.name,
									sourceItem: featureDoc,
								});
							}
							// Collect known schools from grantSpellSchool
							if (rule.type === 'grantSpellSchool') {
								rule.schools?.forEach((s) => schools.add(s.toLowerCase()));
							}
							// Collect known schools from selectSpellSchool
							if (rule.type === 'selectSpellSchool') {
								rule.fixedSchools?.forEach((s) => schools.add(s.toLowerCase()));
								const chosen = currentSpellSchoolSelections[rule.id] ?? [];
								chosen.forEach((s) => schools.add(s.toLowerCase()));
							}
						}
					}
				} catch (err) {
					console.warn('Failed to load feature document:', err);
				}
			}

			// Load and check background document
			if (currentBackground?.uuid) {
				try {
					console.log('[SpellSelection] Loading background from uuid:', currentBackground.uuid);
					const bgDoc = await fromUuid(currentBackground.uuid);
					console.log('[SpellSelection] Loaded background doc:', bgDoc?.name);
					if (bgDoc) {
						for (const rule of getRulesFromDocument(bgDoc)) {
							console.log('[SpellSelection] - Background rule type:', rule.type);
							if (rule.type === 'selectSpell' && rule.baseChoiceCount > 0) {
								console.log('[SpellSelection] Found selectSpell in background:', bgDoc.name);
								rules.push({
									...rule,
									source: bgDoc.name,
									sourceItem: bgDoc,
								});
							}
						}
					}
				} catch (err) {
					console.warn('Failed to load background document:', err);
				}
			}

			console.log(
				'[SpellSelection] Final results - rules:',
				rules.length,
				'schools:',
				schools.size,
			);
			selectSpellRules = rules;
			knownSchools = Array.from(schools);
		}

		loadRulesAndSchools();
	});

	// Load available spells for each rule
	async function loadAvailableSpells(rule) {
		let schools;

		switch (rule.schoolSource) {
			case 'known':
				schools = knownSchools;
				break;
			case 'specific':
				schools = rule.schools ?? [];
				break;
			case 'any':
			default:
				schools = ['fire', 'ice', 'lightning', 'wind', 'radiant', 'necrotic'];
		}

		if (schools.length === 0) return [];

		return getSpellsBySchoolAndTier({
			schools,
			maxTier: rule.maxTier ?? 9,
			utilityOnly: rule.spellType === 'utility',
			excludeUtility: rule.spellType === 'tiered',
		});
	}

	// Check if all selections have been made
	let allSelectionsComplete = $derived.by(() => {
		for (const rule of selectSpellRules) {
			const selections = spellSelections[rule.id] ?? [];
			if (selections.length < rule.baseChoiceCount) {
				return false;
			}
		}
		return true;
	});

	function handleSpellSelect(ruleId, spell) {
		const current = spellSelections[ruleId] ?? [];
		const rule = selectSpellRules.find((r) => r.id === ruleId);
		if (!rule) return;

		const isSelected = current.some((s) => s.uuid === spell.uuid);

		if (isSelected) {
			// Remove selection
			spellSelections = {
				...spellSelections,
				[ruleId]: current.filter((s) => s.uuid !== spell.uuid),
			};
		} else if (current.length < rule.baseChoiceCount) {
			// Add selection
			spellSelections = {
				...spellSelections,
				[ruleId]: [...current, spell],
			};
		}
	}
</script>

{#if selectSpellRules.length > 0}
	<section
		class="nimble-character-creation-section"
		id="{dialog.id}-stage-{CHARACTER_CREATION_STAGES.SPELL_SELECTION}"
	>
		<header class="nimble-section-header" data-header-variant="character-creator">
			<h3 class="nimble-heading" data-heading-variant="section">
				Spell Selection

				{#if !active && allSelectionsComplete}
					<button
						class="nimble-button"
						data-button-variant="icon"
						aria-label="Edit Spell Selection"
						data-tooltip="Edit Spell Selection"
						onclick={() => {
							spellSelections = {};
						}}
					>
						<i class="fa-solid fa-edit"></i>
					</button>
				{/if}
			</h3>
		</header>

		{#if active}
			<Hint {hintText} />

			{#each selectSpellRules as rule (rule.id)}
				<div class="nimble-spell-selection">
					<h4 class="nimble-heading" data-heading-variant="subsection">
						{rule.label || 'Choose Spells'}
						<span class="nimble-spell-selection__source">({rule.source})</span>
					</h4>

					<p class="nimble-spell-selection__info">
						Choose {rule.baseChoiceCount}
						{rule.spellType === 'utility' ? 'utility' : ''}
						{rule.spellType === 'utility' ? 'spell' : 'spells'}{rule.baseChoiceCount > 1 ? 's' : ''}
						{#if rule.schoolSource === 'known'}
							from your known schools
						{:else if rule.schoolSource === 'specific'}
							from {rule.schools?.map((s) => schoolLabels[s] || s).join(', ')}
						{:else}
							from any school
						{/if}
					</p>

					{#await loadAvailableSpells(rule) then spells}
						{#if spells.length === 0}
							<p class="nimble-spell-selection__empty">No spells available for selection.</p>
						{:else}
							<ul class="nimble-spell-list">
								{#each spells as spell (spell.uuid)}
									{@const isSelected = (spellSelections[rule.id] ?? []).some(
										(s) => s.uuid === spell.uuid,
									)}
									{@const currentCount = (spellSelections[rule.id] ?? []).length}
									{@const isDisabled = !isSelected && currentCount >= rule.baseChoiceCount}
									<li class="nimble-spell-list__item">
										<button
											class="nimble-card nimble-spell-card"
											class:selected={isSelected}
											disabled={isDisabled}
											onclick={() => handleSpellSelect(rule.id, spell)}
										>
											<img class="nimble-card__img" src={spell.img} alt={spell.name} />
											<div class="nimble-spell-card__content">
												<h5 class="nimble-spell-card__name">{spell.name}</h5>
												<span class="nimble-spell-card__meta">
													{schoolLabels[spell.school] || spell.school}
													{#if spell.tier > 0}
														• Tier {spell.tier}
													{:else}
														• Cantrip
													{/if}
													{#if spell.isUtility}
														• Utility
													{/if}
												</span>
											</div>
											{#if isSelected}
												<i class="fa-solid fa-check nimble-spell-card__check"></i>
											{/if}
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					{/await}
				</div>
			{/each}
		{:else if allSelectionsComplete}
			<div class="nimble-spell-selection__summary">
				{#each selectSpellRules as rule (rule.id)}
					{#if (spellSelections[rule.id] ?? []).length > 0}
						<div class="nimble-spell-selection__summary-group">
							<span class="nimble-spell-selection__label">{rule.label || 'Selected'}:</span>
							<div class="nimble-spell-selection__summary-spells">
								{#each spellSelections[rule.id] ?? [] as spell}
									<div class="nimble-spell-summary-item">
										<img class="nimble-spell-summary-item__img" src={spell.img} alt={spell.name} />
										<span class="nimble-spell-summary-item__name">{spell.name}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</section>
{/if}

<style lang="scss">
	.nimble-spell-selection {
		padding: 1rem;
		background: var(--nimble-surface-2);
		border-radius: var(--nimble-border-radius);
		margin-block: 0.5rem;

		&__source {
			font-weight: normal;
			font-size: var(--nimble-sm-text);
			color: var(--nimble-text-secondary);
		}

		&__info {
			font-size: var(--nimble-sm-text);
			color: var(--nimble-text-secondary);
			margin-block: 0.5rem;
		}

		&__empty {
			font-style: italic;
			color: var(--nimble-text-secondary);
		}

		&__label {
			font-weight: 600;
		}

		&__summary {
			padding: 1rem;
		}

		&__summary-group {
			margin-block: 0.5rem;
		}

		&__summary-spells {
			display: flex;
			flex-wrap: wrap;
			gap: 0.5rem;
			margin-top: 0.5rem;
		}
	}

	.nimble-spell-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 0.5rem;
		list-style: none;
		padding: 0;
		margin: 0;
		max-height: 400px;
		overflow-y: auto;

		&__item {
			display: contents;
		}
	}

	.nimble-spell-card {
		display: grid;
		grid-template-columns: 3rem 1fr auto;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem;
		border: 2px solid var(--nimble-border-color);
		border-radius: var(--nimble-border-radius);
		background: var(--nimble-surface-1);
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		width: 100%;

		&:hover:not(:disabled) {
			border-color: var(--nimble-accent-color);
		}

		&.selected {
			border-color: var(--nimble-accent-color);
			background: color-mix(in srgb, var(--nimble-accent-color) 10%, var(--nimble-surface-1));
		}

		&:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.nimble-card__img {
			width: 3rem;
			height: 3rem;
			border-radius: var(--nimble-border-radius);
			object-fit: cover;
		}

		&__content {
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
		}

		&__name {
			font-weight: 600;
			font-size: var(--nimble-md-text);
			margin: 0;
		}

		&__meta {
			font-size: var(--nimble-sm-text);
			color: var(--nimble-text-secondary);
		}

		&__check {
			color: var(--nimble-accent-color);
			font-size: 1.25rem;
		}
	}

	.nimble-spell-summary-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.5rem;
		background: var(--nimble-surface-3);
		border-radius: var(--nimble-border-radius);

		&__img {
			width: 1.5rem;
			height: 1.5rem;
			border-radius: var(--nimble-border-radius);
		}

		&__name {
			font-size: var(--nimble-sm-text);
		}
	}
</style>
