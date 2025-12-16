<script>
	import { setContext } from 'svelte';
	import getDeterministicBonus from '../../dice/getDeterministicBonus.js';
	import generateBlankAttributeSet from '../../utils/generateBlankAttributeSet.js';
	import getClassFeaturesByGroup from '../../utils/getClassFeaturesByGroup.js';
	import scrollIntoView from '../../utils/scrollIntoView.js';

	import AncestrySelection from './components/characterCreator/AncestrySelection.svelte';
	import AncestrySizeSelection from './components/characterCreator/AncestrySizeSelection.svelte';
	import BackgroundSelection from './components/characterCreator/BackgroundSelection.svelte';
	import BonusLanguageSelection from './components/characterCreator/BonusLanguageSelection.svelte';
	import ClassSelection from './components/characterCreator/ClassSelection.svelte';
	import SkillPointAssignment from './components/characterCreator/SkillPointAssignment.svelte';
	import SpellSchoolSelection from './components/characterCreator/SpellSchoolSelection.svelte';
	import SpellSelection from './components/characterCreator/SpellSelection.svelte';
	import StatArraySelection from './components/characterCreator/StatArraySelection.svelte';
	import StatAssignment from './components/characterCreator/StatAssignment.svelte';

	const CHARACTER_CREATION_STAGES = {
		CLASS: 0,
		ANCESTRY: '1a',
		ANCESTRY_SIZE: '1b',
		BACKGROUND: 2,
		SPELL_SCHOOLS: '2a',
		SPELL_SELECTION: '2b',
		ARRAY: 3,
		STATS: 4,
		SKILLS: 5,
		LANGUAGES: 6,
		SUBMIT: 7,
	};

	function getAbilityBonuses(ancestry, background, characterClass) {
		const abilityKeys = Object.keys(CONFIG.NIMBLE.abilityScores);

		const rules = [
			...(ancestry?.rules?.values() ?? []),
			...(background?.rules?.values() ?? []),
			...(characterClass?.rules?.values() ?? []),
		];

		if (!rules.length) return null;

		const statBonusRules = rules.filter((rule) => rule.type === 'abilityBonus');

		if (!rules.length) return null;

		const bonuses = new Map(abilityKeys.map((key) => [key, 0]));

		statBonusRules.forEach((rule) => {
			let targetAbilities = rule.abilities;

			if (!targetAbilities.length) return;
			if (targetAbilities.includes('all')) targetAbilities = abilityKeys;

			const bonus = getDeterministicBonus(rule.value, {});

			targetAbilities.forEach((abilityKey) => {
				bonuses.set(abilityKey, bonuses.get(abilityKey) + Number.parseInt(bonus, 10));
			});
		});

		return bonuses;
	}

	function getSkillBonuses(ancestry, background, characterClass) {
		const skillKeys = Object.keys(CONFIG.NIMBLE.skills);

		const rules = [
			...(ancestry?.rules?.values() ?? []),
			...(background?.rules?.values() ?? []),
			...(characterClass?.rules?.values() ?? []),
		];

		const skillBonusRules = rules.filter((rule) => rule.type === 'skillBonus');

		if (!rules.length) return null;

		const bonuses = new Map(skillKeys.map((key) => [key, 0]));

		skillBonusRules.forEach((rule) => {
			let targetSkills = rule.skills;

			if (!targetSkills.length) return;
			if (targetSkills.includes('all')) targetSkills = skillKeys;

			const bonus = getDeterministicBonus(rule.value, {});

			targetSkills.forEach((skillKey) => {
				bonuses.set(skillKey, bonuses.get(skillKey) + Number.parseInt(bonus, 10));
			});
		});

		return bonuses;
	}

	// Helper to get rules from a document - checks both the rules Map and system.rules array
	function getRulesFromDocument(doc) {
		console.log('[DEBUG] getRulesFromDocument for:', doc?.name);
		console.log('[DEBUG] - doc.rules?.size:', doc?.rules?.size);
		console.log('[DEBUG] - doc.system?.rules?.length:', doc?.system?.rules?.length);
		console.log(
			'[DEBUG] - doc._source?.system?.rules?.length:',
			doc?._source?.system?.rules?.length,
		);

		// First try the rules Map (for fully prepared documents)
		const rulesMap = doc?.rules;
		if (rulesMap?.size > 0) {
			console.log('[DEBUG] - Using rules Map');
			return [...rulesMap.values()];
		}
		// Try system.rules array
		if (doc?.system?.rules?.length > 0) {
			console.log('[DEBUG] - Using system.rules');
			return doc.system.rules;
		}
		// Fallback to _source.system.rules (raw source data)
		if (doc?._source?.system?.rules?.length > 0) {
			console.log('[DEBUG] - Using _source.system.rules');
			return doc._source.system.rules;
		}
		return [];
	}

	function hasSpellSchoolSelections(characterClass, classFeatures) {
		console.log('[DEBUG] hasSpellSchoolSelections - classFeatures count:', classFeatures?.length);

		// Check class rules
		const classRules = getRulesFromDocument(characterClass);
		const classHasRules = classRules.some(
			(rule) => rule.type === 'selectSpellSchool' && rule.choiceCount > 0,
		);
		if (classHasRules) {
			console.log('[DEBUG] Found selectSpellSchool in class');
			return true;
		}

		// Check class features
		for (const feature of classFeatures) {
			const featureRules = getRulesFromDocument(feature);
			const featureHasRules = featureRules.some(
				(rule) => rule.type === 'selectSpellSchool' && rule.choiceCount > 0,
			);
			if (featureHasRules) {
				console.log('[DEBUG] Found selectSpellSchool in feature:', feature?.name);
				return true;
			}
		}

		console.log('[DEBUG] No selectSpellSchool rules found');
		return false;
	}

	function areSpellSchoolSelectionsComplete(characterClass, classFeatures, spellSchoolSelections) {
		// Check class rules
		for (const rule of getRulesFromDocument(characterClass)) {
			if (rule.type !== 'selectSpellSchool' || rule.choiceCount === 0) continue;
			const selections = spellSchoolSelections[rule.id] ?? [];
			if (selections.length < rule.choiceCount) return false;
		}

		// Check class features
		for (const feature of classFeatures) {
			for (const rule of getRulesFromDocument(feature)) {
				if (rule.type !== 'selectSpellSchool' || rule.choiceCount === 0) continue;
				const selections = spellSchoolSelections[rule.id] ?? [];
				if (selections.length < rule.choiceCount) return false;
			}
		}

		return true;
	}

	function hasSpellSelections(characterClass, classFeatures, background) {
		console.log('[DEBUG] hasSpellSelections - background:', background?.name);

		// Use helper to get rules from both Map and system.rules
		const classRules = getRulesFromDocument(characterClass);
		const bgRules = getRulesFromDocument(background);

		// Check class and background rules
		const hasClassOrBgRules = [...classRules, ...bgRules].some(
			(rule) => rule.type === 'selectSpell' && rule.baseChoiceCount > 0,
		);
		if (hasClassOrBgRules) {
			console.log('[DEBUG] Found selectSpell in class or background');
			return true;
		}

		// Check class features
		for (const feature of classFeatures) {
			const featureRules = getRulesFromDocument(feature);
			const featureHasRules = featureRules.some(
				(rule) => rule.type === 'selectSpell' && rule.baseChoiceCount > 0,
			);
			if (featureHasRules) {
				console.log('[DEBUG] Found selectSpell in feature:', feature?.name);
				return true;
			}
		}

		console.log('[DEBUG] No selectSpell rules found');
		return false;
	}

	function areSpellSelectionsComplete(characterClass, classFeatures, background, spellSelections) {
		// Use helper to get rules from both Map and system.rules
		const classRules = getRulesFromDocument(characterClass);
		const bgRules = getRulesFromDocument(background);

		// Check class and background rules
		for (const rule of [...classRules, ...bgRules]) {
			if (rule.type !== 'selectSpell' || rule.baseChoiceCount === 0) continue;
			const selections = spellSelections[rule.id] ?? [];
			if (selections.length < rule.baseChoiceCount) return false;
		}

		// Check class features
		for (const feature of classFeatures) {
			for (const rule of getRulesFromDocument(feature)) {
				if (rule.type !== 'selectSpell' || rule.baseChoiceCount === 0) continue;
				const selections = spellSelections[rule.id] ?? [];
				if (selections.length < rule.baseChoiceCount) return false;
			}
		}

		return true;
	}

	function getCurrentStage(
		selectedClass,
		classFeatures,
		selectedAncestry,
		selectedAncestrySize,
		selectedBackground,
		selectedArray,
		selectedAbilityScores,
		remainingSkillPoints,
		bonusLanguages,
		spellSchoolSelections,
		spellSelections,
	) {
		console.log('[DEBUG] getCurrentStage called');
		console.log('[DEBUG] - selectedClass:', selectedClass?.name);
		console.log(
			'[DEBUG] - classFeatures:',
			classFeatures?.length,
			classFeatures?.map((f) => f.name),
		);
		console.log('[DEBUG] - selectedBackground:', selectedBackground?.name);

		const classOptionCount = classOptions.then((classes) => classes.length);

		const ancestryCount = ancestryOptions
			.then((x) => Object.values(x))
			.then((x) => x.reduce((count, category) => count + category.length, 0));

		const backgroundCount = backgroundOptions.then((backgrounds) => backgrounds.length);

		if (classOptionCount && !selectedClass) return CHARACTER_CREATION_STAGES.CLASS;

		if (ancestryCount && !selectedAncestry) {
			return CHARACTER_CREATION_STAGES.ANCESTRY;
		}

		if (selectedAncestry?.system?.size?.length > 1 && !selectedAncestrySize) {
			return CHARACTER_CREATION_STAGES.ANCESTRY_SIZE;
		}

		if (backgroundCount && !selectedBackground) {
			return CHARACTER_CREATION_STAGES.BACKGROUND;
		}

		// Check for spell school selections (e.g., Songweaver "Wind + 1 other")
		// Comes after background since both class and background could grant spell options
		console.log('[DEBUG] Checking spell school selections...');
		const hasSchoolSelections = hasSpellSchoolSelections(selectedClass, classFeatures);
		const schoolSelectionsComplete = areSpellSchoolSelectionsComplete(
			selectedClass,
			classFeatures,
			spellSchoolSelections,
		);
		console.log('[DEBUG] - hasSchoolSelections:', hasSchoolSelections);
		console.log('[DEBUG] - schoolSelectionsComplete:', schoolSelectionsComplete);
		if (selectedClass && hasSchoolSelections && !schoolSelectionsComplete) {
			console.log('[DEBUG] => Returning SPELL_SCHOOLS stage');
			return CHARACTER_CREATION_STAGES.SPELL_SCHOOLS;
		}

		// Check for spell selections (class features like Elemental Mastery, or backgrounds like Academy Dropout)
		console.log('[DEBUG] Checking spell selections...');
		const hasSpellSel = hasSpellSelections(selectedClass, classFeatures, selectedBackground);
		const spellSelComplete = areSpellSelectionsComplete(
			selectedClass,
			classFeatures,
			selectedBackground,
			spellSelections,
		);
		console.log('[DEBUG] - hasSpellSelections:', hasSpellSel);
		console.log('[DEBUG] - spellSelectionsComplete:', spellSelComplete);
		if (hasSpellSel && !spellSelComplete) {
			console.log('[DEBUG] => Returning SPELL_SELECTION stage');
			return CHARACTER_CREATION_STAGES.SPELL_SELECTION;
		}

		console.log('[DEBUG] => Proceeding past spell stages');
		if (!selectedArray) return CHARACTER_CREATION_STAGES.ARRAY;

		const hasUnassignedAbilityScores = Object.values(selectedAbilityScores).some(
			(mod) => mod === null,
		);

		if (hasUnassignedAbilityScores) return CHARACTER_CREATION_STAGES.STATS;
		if (remainingSkillPoints) return CHARACTER_CREATION_STAGES.SKILLS;

		const intelligenceModifier = selectedArray.array?.[selectedAbilityScores.intelligence];

		if (
			!remainingSkillPoints &&
			intelligenceModifier > 0 &&
			bonusLanguages.length < intelligenceModifier
		) {
			return CHARACTER_CREATION_STAGES.LANGUAGES;
		}

		return CHARACTER_CREATION_STAGES.SUBMIT;
	}

	function submit() {
		dialog.submit({
			name,
			origins: {
				background: selectedBackground,
				characterClass: selectedClass,
				ancestry: selectedAncestry,
			},
			abilityScores: Object.entries(selectedAbilityScores).reduce(
				(assignedScores, [abilityKey, index]) => {
					assignedScores[`${abilityKey}.baseValue`] = selectedArray?.array?.[index] ?? 0;
					return assignedScores;
				},
				{},
			),
			sizeCategory: selectedAncestrySize,
			skills: Object.entries(assignedSkillPoints).reduce((assignedPoints, [skillKey, points]) => {
				assignedPoints[`${skillKey}.points`] = points;
				return assignedPoints;
			}, {}),
			languages: ['common', ...bonusLanguages],
			spellSchoolSelections,
			spellSelections,
		});
	}

	let {
		ancestryOptions,
		backgroundOptions,
		bonusLanguageOptions,
		classOptions,
		dialog,
		statArrayOptions,
	} = $props();

	let assignedSkillPoints = $state({});
	let bonusLanguages = $state([]);
	let selectedAbilityScores = $state(generateBlankAttributeSet());
	let name = $state('');
	let selectedArray = $state(null);
	let selectedBackground = $state('');
	let selectedClass = $state('');
	let selectedAncestry = $state('');
	let selectedAncestrySize = $state('medium');
	let spellSchoolSelections = $state({});
	let spellSelections = $state({});
	let classFeatures = $state([]);

	// Load class features when class is selected
	// Must read reactive values synchronously in effect body for proper tracking
	$effect(() => {
		// Capture selectedClass synchronously to establish the dependency
		const currentClass = selectedClass;
		console.log('[DEBUG] Class features effect triggered, currentClass:', currentClass?.name);

		async function loadClassFeatures() {
			if (!currentClass?.system?.groupIdentifiers?.length) {
				console.log('[DEBUG] No groupIdentifiers on class, clearing features');
				classFeatures = [];
				return;
			}

			const groupIdentifiers = currentClass.system.groupIdentifiers;
			console.log('[DEBUG] Loading features for groups:', groupIdentifiers);

			const featureUuids = await getClassFeaturesByGroup(groupIdentifiers, null);
			console.log('[DEBUG] Found feature UUIDs:', featureUuids.length, featureUuids);

			const loadedFeatures = [];
			for (const uuid of featureUuids) {
				const feature = await fromUuid(uuid);
				if (feature) {
					console.log(
						'[DEBUG] Loaded feature:',
						feature.name,
						'- rules.size:',
						feature.rules?.size,
						'- system.rules.length:',
						feature.system?.rules?.length,
					);
					loadedFeatures.push(feature);
				}
			}

			console.log('[DEBUG] Total loaded features:', loadedFeatures.length);
			classFeatures = loadedFeatures;
		}

		loadClassFeatures();
	});

	let abilityBonuses = $derived(
		getAbilityBonuses(selectedAncestry, selectedBackground, selectedClass),
	);

	let skillBonuses = $derived(getSkillBonuses(selectedAncestry, selectedBackground, selectedClass));

	let remainingSkillPoints = $derived(
		4 - Object.values(assignedSkillPoints).reduce((a, b) => a + b, 0),
	);

	let stage = $derived(
		getCurrentStage(
			selectedClass,
			classFeatures,
			selectedAncestry,
			selectedAncestrySize,
			selectedBackground,
			selectedArray,
			selectedAbilityScores,
			remainingSkillPoints,
			bonusLanguages,
			spellSchoolSelections,
			spellSelections,
		),
	);

	let stageNumber = $derived(stage.toString().match(/\d+/)[0]);

	setContext('dialog', dialog);
	setContext('CHARACTER_CREATION_STAGES', CHARACTER_CREATION_STAGES);

	$effect(() => {
		scrollIntoView(`${dialog.id}-stage-${stage}`);
	});
</script>

<header class="nimble-sheet__header nimble-sheet__header--character-creator">
	<label class="nimble-field nimble-field--full-width" data-field-variant="stacked">
		<span class="nimble-heading nimble-field__label" data-heading-variant="field">
			Character Name
		</span>

		<input
			autocomplete="off"
			spellcheck="false"
			type="text"
			bind:value={name}
			placeholder="New Character"
		/>
	</label>
</header>

<article
	class="nimble-sheet__body nimble-sheet__body--character-creator"
	style="scroll-behavior: smooth;"
>
	{#await classOptions then classes}
		<ClassSelection
			active={stage === CHARACTER_CREATION_STAGES.CLASS}
			{classes}
			bind:selectedClass
		/>
	{/await}

	{#await ancestryOptions then ancestries}
		<AncestrySelection
			active={stage === CHARACTER_CREATION_STAGES.ANCESTRY}
			{ancestries}
			bind:selectedAncestry
			bind:selectedAncestrySize
		/>
	{/await}

	<AncestrySizeSelection
		active={stage === CHARACTER_CREATION_STAGES.ANCESTRY_SIZE}
		{selectedAncestry}
		bind:selectedAncestrySize
	/>

	{#await backgroundOptions then backgrounds}
		<BackgroundSelection
			active={stage === CHARACTER_CREATION_STAGES.BACKGROUND}
			{backgrounds}
			bind:selectedBackground
		/>
	{/await}

	<SpellSchoolSelection
		active={stage === CHARACTER_CREATION_STAGES.SPELL_SCHOOLS}
		{selectedClass}
		{classFeatures}
		bind:spellSchoolSelections
	/>

	<SpellSelection
		active={stage === CHARACTER_CREATION_STAGES.SPELL_SELECTION}
		{selectedClass}
		{classFeatures}
		{selectedBackground}
		{spellSchoolSelections}
		bind:spellSelections
	/>

	<StatArraySelection
		active={stage === CHARACTER_CREATION_STAGES.ARRAY}
		bind:bonusLanguages
		bind:selectedAbilityScores
		bind:selectedArray
		{statArrayOptions}
	/>

	<StatAssignment
		active={stage === CHARACTER_CREATION_STAGES.STATS}
		bind:bonusLanguages
		{selectedArray}
		{selectedClass}
		bind:selectedAbilityScores
	/>

	<SkillPointAssignment
		active={stage === CHARACTER_CREATION_STAGES.SKILLS}
		bind:assignedSkillPoints
		{abilityBonuses}
		{remainingSkillPoints}
		{selectedAbilityScores}
		{selectedArray}
		{skillBonuses}
	/>

	<BonusLanguageSelection
		active={stage === CHARACTER_CREATION_STAGES.LANGUAGES}
		bind:bonusLanguages
		{bonusLanguageOptions}
		{remainingSkillPoints}
		{selectedArray}
		{selectedAbilityScores}
	/>
</article>

<footer class="nimble-sheet__footer nimble-sheet__footer--character-creator">
	<div class="nimble-progress-bar nimble-progress-bar--stage-{stageNumber}">
		<span class="nimble-progress-bar__label"> {stageNumber} / 7 </span>
	</div>

	<button
		class="nimble-button"
		data-button-variant="basic"
		data-tooltip={stage !== CHARACTER_CREATION_STAGES['SUBMIT']
			? 'Some character creation steps have not been completed.'
			: null}
		data-tooltip-direction="UP"
		onclick={submit}
	>
		Create Character

		{#if stage !== CHARACTER_CREATION_STAGES['SUBMIT']}
			<i class="nimble-button__icon fa-solid fa-triangle-exclamation" data-icon-style="warning"></i>
		{/if}
	</button>
</footer>

<style lang="scss">
	.nimble-sheet__body {
		--nimble-card-content-grid: 'img title';
		--nimble-card-column-dimensions: 2.5rem 1fr;
		--nimble-card-row-dimensions: max-content;
		--nimble-card-title-alignment: center;
		--nimble-card-width: fit-content;
		--nimble-card-min-width: 8rem;
		--nimble-card-padding: 0 0.5rem 0 0;
	}

	.nimble-sheet__footer {
		--nimble-button-padding: 0.125rem 0.5rem;
	}

	.nimble-progress-bar {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		position: relative;
		overflow: hidden;
		flex-grow: 1;
		height: 2rem;
		background-color: #474645;
		border: 1px solid var(--nimble-card-border-color, hsl(41, 18%, 54%));
		border-radius: 4px;

		&::after {
			content: '';
			grid-column-start: 1;
			box-shadow: 0 0 6px rgba(0, 0, 0, 0.45);
			background: linear-gradient(to right, hsl(138, 47%, 20%) 0%, hsl(139, 47%, 44%) 100%);
		}

		&--stage-0::after {
			width: 0;
		}

		@for $i from 1 through 7 {
			&--stage-#{$i}::after {
				grid-column-end: $i + 1;
			}
		}

		&__label {
			position: absolute;
			top: 50%;
			left: 50%;
			color: #fff;
			text-shadow: 0 0 4px black;
			transform: translate(-50%, -50%);
		}
	}
</style>
