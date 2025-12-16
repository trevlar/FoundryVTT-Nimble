import { AbilityBonusRule } from '../models/rules/abilityBonus.js';
import { ArmorClassRule } from '../models/rules/armorClass.js';
import { ItemGrantRule } from '../models/rules/grantItem.js';
import { GrantProficiencyRule } from '../models/rules/grantProficiencies.ts';
import { GrantSpellSchoolRule } from '../models/rules/grantSpellSchool.js';
import { GrantSpellsRule } from '../models/rules/grantSpells.js';
import { InitiativeBonusRule } from '../models/rules/initiativeBonus.js';
import { MaxHitDiceRule } from '../models/rules/maxHitDice.js';
import { MaxHpBonusRule } from '../models/rules/maxHpBonus.js';
import { MaxWoundsRule } from '../models/rules/maxWounds.js';
import { NoteRule } from '../models/rules/note.js';
import { SelectSpellRule } from '../models/rules/selectSpell.js';
import { SelectSpellSchoolRule } from '../models/rules/selectSpellSchool.js';
import { SkillBonusRule } from '../models/rules/skillBonus.js';

export default function registerRulesConfig() {
	const ruleTypes = {
		abilityBonus: 'NIMBLE.ruleTypes.abilityBonus',
		armorClass: 'NIMBLE.ruleTypes.armorClass',
		grantItem: 'NIMBLE.ruleTypes.grantItem',
		grantProficiency: 'NIMBLE.ruleTypes.grantProficiency',
		grantSpells: 'NIMBLE.ruleTypes.grantSpells',
		grantSpellSchool: 'NIMBLE.ruleTypes.grantSpellSchool',
		initiativeBonus: 'NIMBLE.ruleTypes.initiativeBonus',
		maxHitDice: 'NIMBLE.ruleTypes.maxHitDice',
		maxHpBonus: 'NIMBLE.ruleTypes.maxHpBonus',
		maxWounds: 'NIMBLE.ruleTypes.maxWounds',
		note: 'NIMBLE.ruleTypes.note',
		selectSpell: 'NIMBLE.ruleTypes.selectSpell',
		selectSpellSchool: 'NIMBLE.ruleTypes.selectSpellSchool',
		skillBonus: 'NIMBLE.ruleTypes.skillBonus',
	};

	const ruleDataModels = {
		abilityBonus: AbilityBonusRule,
		armorClass: ArmorClassRule,
		grantItem: ItemGrantRule,
		grantProficiency: GrantProficiencyRule,
		grantSpells: GrantSpellsRule,
		grantSpellSchool: GrantSpellSchoolRule,
		initiativeBonus: InitiativeBonusRule,
		maxHitDice: MaxHitDiceRule,
		maxHpBonus: MaxHpBonusRule,
		maxWounds: MaxWoundsRule,
		note: NoteRule,
		selectSpell: SelectSpellRule,
		selectSpellSchool: SelectSpellSchoolRule,
		skillBonus: SkillBonusRule,
	} as const;

	return { ruleDataModels, ruleTypes };
}
