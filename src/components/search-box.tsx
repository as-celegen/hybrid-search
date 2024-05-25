export interface SearchBoxProps {
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    namespaces: string[];
}

export default function SearchBox({ onSubmit, namespaces }: SearchBoxProps) {
    return (
        <form className="flex flex-row items-center justify-center w-full" onSubmit={onSubmit}>
            <label>Search: </label>
            <input required type={"text"} className="bg-amber-100 text-blue-700"/>
            <label>Namespace: </label>
            <select className="bg-amber-100 text-blue-700">
                {namespaces.map((namespace) => (
                    <option key={namespace} value={namespace} className="bg-amber-100 text-blue-700">{namespace.length == 0 ? <i>(Default)</i>: namespace}</option>
                ))}
            </select>
            <button type={"submit"}>Search</button>
        </form>
    );
}