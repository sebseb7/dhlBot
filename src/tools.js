// Define the tools for OpenAI function calling
const tools = [
    {
        type: "function",
        function: {
            name: "print_shipping_label",
            description: "Drucke ein Versandetikett nach dem Sammeln und Bestätigen aller erforderlichen Informationen",
            parameters: {
                type: "object",
                properties: {
                    from_address: {
                        type: "string",
                        description: "Die vollständige Adresse des Absenders"
                    },
                    to_address: {
                        type: "string",
                        description: "Die vollständige Adresse des Empfängers"
                    },
                    weight: {
                        type: "string",
                        description: "Das Gewicht des Pakets in Kilogramm"
                    }
                },
                required: ["from_address", "to_address", "weight"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "validate_address",
            description: "Validiere eine Adresse mit der Google Maps API",
            parameters: {
                type: "object",
                properties: {
                    address: {
                        type: "string",
                        description: "Die zu validierende Adresse"
                    }
                },
                required: ["address"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "save_sender_address",
            description: "Speichere die Absenderadresse für zukünftige Verwendung",
            parameters: {
                type: "object",
                properties: {
                    address: {
                        type: "string",
                        description: "Die zu speichernde Absenderadresse"
                    }
                },
                required: ["address"]
            }
        }
    }
];

module.exports = tools; 