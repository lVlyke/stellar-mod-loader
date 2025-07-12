export namespace AsyncUtils {

    export async function batchTaskAsync<T>(
        items: T[],
        batchSize: number,
        task: (item: T, index: number) => Promise<unknown>
    ): Promise<void> {
        let curIndex = 0;
        while (curIndex < items.length) {
            await new Promise(async (resolve) => {
                for (let j = 0; j < Math.min(batchSize, items.length - curIndex); ++j, ++curIndex) {
                    await task(items[curIndex], curIndex);
                }

                setTimeout(() => resolve(undefined));
            });
        }
    }
}