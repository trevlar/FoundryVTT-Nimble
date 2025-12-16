import { NimbleBaseItemData } from './BaseItemDataModel.js';
import { activation } from './common.js';

const { fields } = foundry.data;

const schema = () => ({
	description: new fields.HTMLField({ required: true, initial: '', nullable: false }),
	featureType: new fields.StringField({ required: true, nullable: false, initial: 'class' }),
	class: new fields.StringField({ required: true, nullable: false, initial: '' }),
	group: new fields.StringField({ required: true, nullable: false, initial: '' }),
	level: new fields.NumberField({ required: false, nullable: true, initial: null, integer: true }),
});

declare namespace NimbleFeatureData {
	type Schema = NimbleBaseItemData.Schema &
		ReturnType<typeof activation> &
		ReturnType<typeof schema>;
	type BaseData = NimbleBaseItemData.BaseData;
	type DerivedData = NimbleBaseItemData.DerivedData;
}

class NimbleFeatureData extends NimbleBaseItemData<
	NimbleFeatureData.Schema,
	NimbleFeatureData.BaseData,
	NimbleFeatureData.DerivedData
> {
	/** @inheritDoc */
	static override defineSchema(): NimbleFeatureData.Schema {
		return {
			...NimbleBaseItemData.defineSchema(),
			...activation(),
			...schema(),
		};
	}
}

export { NimbleFeatureData };
