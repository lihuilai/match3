import { _decorator, Button, Color, Component, director, find, Label, Node, Sprite, Vec2 } from 'cc';
const { ccclass } = _decorator;

export interface ItemData {
    /** item 唯一标识 id */
    id: number;
    /** 背景图片颜色（应用到 img_bg.color） */
    bgColor: Color;
    /** 图标文本内容（应用到 lbl_icon.string） */
    iconText: string;
    /** 图标文本颜色（应用到 lbl_icon.color） */
    iconColor: Color;
    /** 当前 item 被哪些 item 遮挡（存储其 id 列表） */
    maskItemIds: number[];
    /** 所在层级（用于排序或遮挡关系计算） */
    layer: number;
    /** 当前格子在本层的行列索引（x: 列, y: 行） */
    index: Vec2;
    /** 当前格子相对布局原点的偏移 */
    offset: Vec2;
    /** 是否已进入 slot 区域 */
    inSlot: boolean;
}

@ccclass('Item')
export class Item extends Component {
    private data: ItemData | null = null;

    // btn_ 开头：按钮组件
    private btn_item: Button | null = null;

    // img_ 开头：图片组件
    private img_shadow: Sprite | null = null;
    private img_bg: Sprite | null = null;
    private img_mask: Sprite | null = null;

    // lbl_ 开头：文本组件
    private lbl_icon: Label | null = null;

    onLoad() {
        const nod_btnItem = find('btn_item', this.node);
        this.btn_item = nod_btnItem?.getComponent(Button) ?? null;
        this.img_shadow = find('btn_item/img_shadow', this.node)?.getComponent(Sprite) ?? null;
        this.img_bg = find('btn_item/img_bg', this.node)?.getComponent(Sprite) ?? null;
        this.img_mask = find('btn_item/img_mask', this.node)?.getComponent(Sprite) ?? null;
        this.lbl_icon = find('btn_item/lbl_icon', this.node)?.getComponent(Label) ?? null;
    }

    onEnable() {
        this.btn_item?.node.on(Button.EventType.CLICK, this.onClickItem, this);
    }

    onDisable() {
        this.btn_item?.node.off(Button.EventType.CLICK, this.onClickItem, this);
    }

    private onClickItem() {
        if (!this.data) {
            return;
        }
        director.emit('点击地图cell', this, this.data);
    }

    setData(data: ItemData) {
        this.data = data;
        this.img_bg && (this.img_bg.color = data.bgColor);
        if (this.lbl_icon) {
            this.lbl_icon.string = data.iconText;
            this.lbl_icon.color = data.iconColor;
        }
        if (this.img_mask){
            this.img_mask.node.active = data.maskItemIds.length > 0;
            this.btn_item.interactable = data.maskItemIds.length === 0;
        }
    }

    getData(): ItemData | null {
        return this.data;
    }

    // CocosCreator NodePool 回调：节点取出时触发
    reuse(...args: unknown[]) {
        void args;
    }

    // CocosCreator NodePool 回调：节点回收到池时触发
    unuse() {
        this.img_shadow && (this.img_shadow.color = Color.BLACK);
        this.img_bg && (this.img_bg.color = Color.WHITE);
        if (this.lbl_icon) {
            this.lbl_icon.string = '';
            this.lbl_icon.color = Color.BLACK;
        }
        this.data = null;
    }
}


