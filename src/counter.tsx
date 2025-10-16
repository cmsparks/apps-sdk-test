import { RpcStub, RpcTarget } from "capnweb";
import { RpcComponent } from "./rpc-components";

/**
 * Server side code for the counter
 */
export class UIEntrypoint extends RpcTarget {
    private onUISessionChange: () => Promise<void> = async () => { }
    private sessionItems: Array<{ favorited: boolean; title: string; description: string }> = [
        { favorited: false, title: "Alpha", description: "First card in the list." },
        { favorited: false, title: "Bravo", description: "Second card with additional details." },
        { favorited: false, title: "Charlie", description: "A descriptive third card." },
        { favorited: false, title: "Delta", description: "Contains example server-side data." },
        { favorited: false, title: "Echo", description: "Stubbed content for preview." },
        { favorited: false, title: "Foxtrot", description: "Useful placeholder information." },
        { favorited: false, title: "Golf", description: "Another item rendered via RPC." },
        { favorited: false, title: "Hotel", description: "Items fetched on the server." },
        { favorited: false, title: "India", description: "Demonstrates server-rendered UI." },
        { favorited: false, title: "Juliet", description: "More data to fill the list." },
        { favorited: false, title: "Kilo", description: "Consistent placeholder description." },
        { favorited: false, title: "Lima", description: "Final example item." },
        { favorited: false, title: "Mike", description: "Final example item." },
        { favorited: false, title: "November", description: "Final example item." },
        { favorited: false, title: "Oscar", description: "Final example item." },
        { favorited: false, title: "Hotel", description: "Items fetched on the server." },
        { favorited: false, title: "India", description: "Demonstrates server-rendered UI." },
        { favorited: false, title: "Juliet", description: "More data to fill the list." },
        { favorited: false, title: "Kilo", description: "Consistent placeholder description." },
        { favorited: false, title: "Lima", description: "Final example item." },
    ]

    constructor(public env: Env) {
        super()
    }

    registerOnUIChange(cb: RpcStub<() => void>) {
        this.onUISessionChange = cb.dup()
    }

    @RpcComponent()
    async CardList() {
        const items = await this.getStubbedItems()
        return <div className="card-list" role="list">
            {await Promise.all(items.map(async (item, id) => {
                const { favorited, title, description, imageUrl } = await item
                return (
                    <div key={id} className="card" role="listitem">
                        <img className="card-img" src={imageUrl} alt={title} loading="lazy" />
                        <div className="card-title">{title}</div>
                        <div className="card-desc">{description}</div>
                        <button onClick={(e) => {
                            console.log(`Clicked favorite on the server (${e.clientX}, ${e.clientY})`)
                            this.sessionItems[id].favorited = !this.sessionItems[id].favorited
                            this.onUISessionChange()
                        }}>
                            {favorited ? "Unfavorite" : "Favorite"}
                        </button>
                        <button onClick={(e) => {
                            console.log(`Clicked remove on the server (${e.clientX}, ${e.clientY})`)
                            this.sessionItems.splice(id, 1)
                            this.onUISessionChange()
                        }}>
                            Remove
                        </button>
                    </div>
                )
            }))}
        </div>
    }

    private async getStubbedItems(): Promise<Array<Promise<{ favorited: boolean; title: string; description: string; imageUrl: string }>>> {
        // Simulate latency of initial fetch
        await new Promise((r) => setTimeout(r, 50))
        const items = this.sessionItems.map((item, id) => ({ ...item, imageUrl: `https://picsum.photos/seed/${encodeURIComponent(id)}/300` }))
        // simulate per-item latency for variety
        return items.map((item) => new Promise((r) => setTimeout(() => r(item), 50 + Math.random() * 100)))
    }
}