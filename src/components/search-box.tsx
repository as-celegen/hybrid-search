export interface SearchBoxProps {
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    namespaces: string[];
}

export default function SearchBox({ onSubmit, namespaces }: SearchBoxProps) {
    return (
        <form className="flex flex-row items-center justify-evenly w-full justify-self-stretch" onSubmit={onSubmit}>
            <div>
                <label className="text-lg">Search: </label>
                <input required type={"text"} className="bg-amber-100 text-blue-700 rounded"/>
            </div>
            <div>
                <label className="text-lg">Namespace: </label>
                <select className="bg-amber-100 text-blue-700 rounded">
                    {namespaces.map((namespace) => (
                        <option key={namespace} value={namespace} className="bg-amber-100 text-blue-700">{namespace.length == 0 ? "(Default)" : namespace}</option>
                    ))}
                </select>
            </div>
            <button type={"submit"} className="bg-red-500 hover:bg-red-700 rounded p-1" >Search</button>
        </form>
    );
}