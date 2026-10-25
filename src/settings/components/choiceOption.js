import GObject from 'gi://GObject';

export const ChoiceOption = GObject.registerClass(
    {
        Properties: {
            name: GObject.ParamSpec.string(
                'name',
                'name',
                'name',
                GObject.ParamFlags.READWRITE,
                null
            ),
            value: GObject.ParamSpec.string(
                'value',
                'value',
                'value',
                GObject.ParamFlags.READWRITE,
                null
            )
        }
    },
    class ChoiceOptionObject extends GObject.Object {
        _init(name, value) {
            super._init({ name, value });
        }
    }
);

export const selectRowValue = (row, value) => {
    const { model } = row;
    for (let i = 0; i < model.get_n_items(); i++) {
        if (model.get_item(i).value === value) {
            row.set_selected(i);
            break;
        }
    }
};
