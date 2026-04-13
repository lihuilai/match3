import { _decorator, Button, Color, Component, director, find, instantiate, Node, NodePool, Prefab, Vec2 } from 'cc';
import { Item, ItemData } from './Item';
const { ccclass,property } = _decorator;

interface ItemTypeConfig {
    /** 种类 id */
    typeId: number;
    /** 种类文本（Unicode 符号） */
    typeText: string;
    /** 种类文本颜色 */
    typeColor: Color;
    /** 种类背景颜色 */
    bgColor: Color;
}

const UNICODE_TAG_POOL: string[] = [
    '★', '◆', '●', '■', '▲', '▼', '♠', '♥', '♦', '♣',
    '☀', '☁', '☂', '☃', '☄', '☎', '⌛', '⌘', '⚙', '⚡',
    '✈', '✉', '✦', '✿', '❄', '❖', '❂', '❀', '☯', '☮',
];

const ITEM_TYPE_LIST: ItemTypeConfig[] = (() => {
    const tags = [...UNICODE_TAG_POOL];
    for (let i = tags.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = tags[i];
        tags[i] = tags[j];
        tags[j] = temp;
    }

    const palette = [
        new Color(255, 99, 132, 255), new Color(54, 162, 235, 255), new Color(255, 206, 86, 255),
        new Color(75, 192, 192, 255), new Color(153, 102, 255, 255), new Color(255, 159, 64, 255),
        new Color(46, 204, 113, 255), new Color(52, 152, 219, 255), new Color(231, 76, 60, 255),
        new Color(241, 196, 15, 255),
    ];
    const pickRandomColor = (): Color => {
        const idx = Math.floor(Math.random() * palette.length);
        return palette[idx].clone();
    };

    const list: ItemTypeConfig[] = [];
    for (let i = 0; i < 20; i++) {
        list.push({
            typeId: i + 1,
            typeText: tags[i],
            typeColor: pickRandomColor(),
            bgColor: pickRandomColor(),
        });
    }
    return list;
})();

@ccclass('Main')
export class Main extends Component {
    private static readonly SLOT_LIMIT = 7;

    @property({type:Prefab})
    itemPrefab: Prefab | null = null;
    /** 地图数据（按层二维数组） */
    private mapDataList: ItemData[][] = [];
    /** 地图实例（按层二维数组） */
    private mapItemList: Item[][] = [];
    /** item 对象池 */
    private itemPool: NodePool = new NodePool('item');
    /** 点击后进入 slot 的 Item 列表（上限 7） */
    private slotItemList: Item[] = [];
    /** slot 区域对应的数据列表（与 slotItemList 顺序一致） */
    private slotDataList: ItemData[] = [];
    // nod_ 开头：节点类型
    private nod_map: Node | null = null;
    private nod_layout: Node | null = null;
    // btn_ 开头：按钮组件类型
    private btn_undo: Button | null = null;
    private btn_replay: Button | null = null;
    onLoad() {
        // 从 Canvas 节点开始查找
        const canvas = find('Canvas');
        if (!canvas) {
            console.error('[Main] Canvas 节点未找到');
            return;
        }
        // 查找 nod_ 节点
        this.nod_map = find('level/nod_map', canvas);
        this.nod_layout = find('slot/nod_layout', canvas);
        // 查找 btn_ 按钮组件
        this.btn_undo = find('ctrl/btn_undo', canvas)?.getComponent(Button) ?? null;
        this.btn_replay = find('ctrl/btn_replay', canvas)?.getComponent(Button) ?? null;
    }

    onEnable() {
        this.btn_undo?.node.on(Button.EventType.CLICK, this.onClickUndo, this);
        this.btn_replay?.node.on(Button.EventType.CLICK, this.onClickReplay, this);
        director.on('点击地图cell', this.onClickMapCell, this);
    }

    onDisable() {
        this.btn_undo?.node.off(Button.EventType.CLICK, this.onClickUndo, this);
        this.btn_replay?.node.off(Button.EventType.CLICK, this.onClickReplay, this);
        director.off('点击地图cell', this.onClickMapCell, this);
    }

    private onClickUndo() {
        console.log('[Main] 点击了 btn_undo');
    }

    private onClickReplay() {
        console.log('[Main] 点击了 btn_replay');
        this.createMap(6, 6, 4, 20);
    }

    private onClickMapCell(item: Item, data: ItemData) {
        if (data.inSlot) {
            return;
        }

        // 从地图实例列表中移除引用，并切换到 slot
        this.removeItemFromMapList(item);
        data.inSlot = true;
        item.node.setParent(this.nod_layout);

        // 插入到 iconText 相同项的最后一个后面
        const insertIndex = this.getInsertIndexByIconText(data.iconText);
        this.slotItemList.splice(insertIndex, 0, item);
        this.slotDataList.splice(insertIndex, 0, data);
        this.syncSlotItemSiblingOrder();

        // 连续 3 个 iconText 相同时，从数据与实例数组中移除并回收
        while (this.tryRemoveTripleMatch()) {
            this.syncSlotItemSiblingOrder();
        }

        this.checkGameResult();
        if (this.slotItemList.length >= Main.SLOT_LIMIT) {
            alert('游戏失败');
        }
    }

    /** 计算 slot 插入位置：放在相同 iconText 的最后一个后面 */
    private getInsertIndexByIconText(iconText: string): number {
        let lastSameIndex = -1;
        for (let i = 0; i < this.slotDataList.length; i++) {
            if (this.slotDataList[i].iconText === iconText) {
                lastSameIndex = i;
            }
        }
        return lastSameIndex >= 0 ? lastSameIndex + 1 : this.slotItemList.length;
    }

    /** 同步 slot 下 Item 的节点顺序与数组顺序 */
    private syncSlotItemSiblingOrder() {
        for (let i = 0; i < this.slotItemList.length; i++) {
            this.slotItemList[i].node.setSiblingIndex(i);
        }
    }

    /** 检测并移除一次连续 3 个相同 iconText，若有移除返回 true */
    private tryRemoveTripleMatch(): boolean {
        for (let i = 0; i <= this.slotDataList.length - 3; i++) {
            const text = this.slotDataList[i].iconText;
            if (
                this.slotDataList[i + 1].iconText === text &&
                this.slotDataList[i + 2].iconText === text
            ) {
                for (let j = 0; j < 3; j++) {
                    const removeData = this.slotDataList[i];
                    const removeItem = this.slotItemList[i];
                    removeData.inSlot = false;
                    this.slotDataList.splice(i, 1);
                    this.slotItemList.splice(i, 1);
                    this.putItemToPool(removeItem);
                }
                return true;
            }
        }
        return false;
    }

    /** 检查通关条件：地图与 slot 都清空时通关 */
    private checkGameResult() {
        const mapRemainCount = this.getMapItemRemainCount();
        if (this.slotItemList.length === 0 && mapRemainCount === 0) {
            alert('通关成功');
        }
    }

    /** 统计地图区域剩余 Item 数量 */
    private getMapItemRemainCount(): number {
        let count = 0;
        for (let layer = 0; layer < this.mapItemList.length; layer++) {
            count += this.mapItemList[layer].length;
        }
        return count;
    }

    /** 从地图二维实例数组中移除指定 item 引用 */
    private removeItemFromMapList(item: Item) {
        for (let layer = 0; layer < this.mapItemList.length; layer++) {
            const layerItems = this.mapItemList[layer];
            const idx = layerItems.indexOf(item);
            if (idx !== -1) {
                layerItems.splice(idx, 1);
                return;
            }
        }
    }

    /** 从对象池获取一个 Item 实例（为空时根据 itemPrefab 实例化） */
    private getItemFromPool(): Item {
        let itemNode: Node | null = null;
        if (this.itemPool.size() > 0) {
            itemNode = this.itemPool.get();
        } else {
            if (!this.itemPrefab) {
                throw new Error('[Main] itemPrefab 未设置，无法实例化 item');
            }
            itemNode = instantiate(this.itemPrefab);
        }

        const itemComp = itemNode.getComponent(Item);
        if (!itemComp) {
            throw new Error('[Main] itemPrefab 缺少 Item 组件');
        }
        return itemComp;
    }

    /** 将 Item 实例移出节点树并放回对象池 */
    private putItemToPool(item: Item) {
        const itemNode = item.node;
        itemNode.removeFromParent();
        this.itemPool.put(itemNode);
    }

    /** 创建地图：先创建地图数据，再创建/复用 Item 实例并 setData */
    private createMap(firstLayerRows: number, firstLayerCols: number, layerCount: number, showTypeCount: number) {
        this.clearMap();
        this.mapDataList = this.createMapData(firstLayerRows, firstLayerCols, layerCount, showTypeCount);
        this.mapItemList = [];

        for (let layer = 0; layer < this.mapDataList.length; layer++) {
            const layerData = this.mapDataList[layer];
            const layerItems: Item[] = [];
            for (let i = 0; i < layerData.length; i++) {
                const data = layerData[i];
                const item = this.getItemFromPool();
                item.node.setParent(this.nod_map);
                item.node.setPosition(data.offset.x, data.offset.y);
                item.setData(data);
                layerItems.push(item);
            }
            this.mapItemList.push(layerItems);
        }
    }

    /** 清空地图：回收 Item，并清空实例引用与地图数据 */
    private clearMap() {
        for (let i = 0; i < this.slotItemList.length; i++) {
            const item = this.slotItemList[i];
            const data = item.getData();
            if (data) {
                data.inSlot = false;
            }
            this.putItemToPool(item);
        }
        this.slotItemList = [];
        this.slotDataList = [];

        for (let layer = 0; layer < this.mapItemList.length; layer++) {
            const layerItems = this.mapItemList[layer];
            for (let i = 0; i < layerItems.length; i++) {
                this.putItemToPool(layerItems[i]);
            }
        }
        this.mapItemList = [];
        this.mapDataList = [];
    }

    /**
     * 创建地图数据：
     * - 第 1 层使用 firstLayerRows/firstLayerCols
     * - 每升高 1 层，行列各减 1（最小为 1）
     * - 全图满足：showTypeCount * 3 < 所有层级格子总数
     */
    private createMapData(
        firstLayerRows: number,
        firstLayerCols: number,
        layerCount: number,
        showTypeCount: number,
        cellSize: Vec2 = new Vec2(80, 80),
    ): ItemData[][] {
        if (firstLayerRows < 1 || firstLayerCols < 1 || layerCount < 1 || showTypeCount < 1) {
            throw new Error('[Main] 参数非法：行列、层数、种类数都必须大于等于 1');
        }
        if (showTypeCount > ITEM_TYPE_LIST.length) {
            throw new Error(`[Main] showTypeCount 超出种类配置上限：${showTypeCount} > ${ITEM_TYPE_LIST.length}`);
        }

        const layerSizeList: Array<{ rows: number; cols: number;offset: Vec2 }> = [];
        let totalCellCount = 0;
        for (let layer = 0; layer < layerCount; layer++) {
            const rows = Math.max(1, firstLayerRows - layer);
            const cols = Math.max(1, firstLayerCols - layer);
            layerSizeList.push({ rows, cols, offset: new Vec2((layer+1) * cellSize.x*0.5, (layer+1) * cellSize.y*0.5) });
            totalCellCount += rows * cols;
        }

        if (showTypeCount * 3 > totalCellCount) {
            throw new Error(
                `[Main] 格子总数不足，要求 showTypeCount * 3 < 所有层级格子总数，当前为 ${showTypeCount * 3} >= ${totalCellCount}`,
            );
        }

        const layers: ItemData[][] = [];
        const globalTypePool = this.buildTypePool(showTypeCount, totalCellCount);
        let poolIndex = 0;
        let uid = 1;

        for (let layer = 0; layer < layerCount; layer++) {
            const rows = layerSizeList[layer].rows;
            const cols = layerSizeList[layer].cols;
            const offset = layerSizeList[layer].offset;
            const layerData: ItemData[] = [];

            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const typeCfg = globalTypePool[poolIndex++];
                    layerData.push({
                        id: uid++,
                        bgColor: typeCfg.bgColor.clone(),
                        iconText: typeCfg.typeText,
                        iconColor: typeCfg.typeColor.clone(),
                        maskItemIds: [],
                        inSlot: false,
                        layer,
                        index: new Vec2(col, row),
                        offset: new Vec2(col * cellSize.x+offset.x, row * cellSize.y+offset.y),
                    });
                }
            }

            layers.push(layerData);
        }

        return layers;
    }

    /** 构造种类池：每种至少 3 个，其余位置循环补齐 */
    private buildTypePool(showTypeCount: number, totalCount: number): ItemTypeConfig[] {
        const pool: ItemTypeConfig[] = [];
        const typeList = ITEM_TYPE_LIST.slice(0, showTypeCount);
        for (let type = 0; type < showTypeCount; type++) {
            for (let i = 0; i < 3; i++) {
                pool.push(typeList[type]);
            }
        }

        for (let i = pool.length; i < totalCount; i++) {
            pool.push(typeList[i % showTypeCount]);
        }

        // 简单随机打散
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = pool[i];
            pool[i] = pool[j];
            pool[j] = temp;
        }
        return pool;
    }

    start() {
        this.createMap(6, 6, 4, 20);
    }
    
    update(deltaTime: number) {

    }
}


