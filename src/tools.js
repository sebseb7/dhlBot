// Define the tools for OpenAI function calling
const tools = [
    {
        type: "function",
        function: {
            name: "issue_shipping_label",
            description: "Erstelle ein Versandetikett nach dem Sammeln und Bestätigen aller erforderlichen Informationen",
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
    },
    {
        type: "function",
        function: {
            name: "check_shipment_status",
            description: "Überprüfe den Status einer Sendung anhand der Sendungsnummer",
            parameters: {
                type: "object",
                properties: {
                    shipment_number: {
                        type: "string",
                        description: "Die DHL Sendungsnummer zum Statuscheck"
                    }
                },
                required: ["shipment_number"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "cancel_shipment",
            description: "Storniere eine Sendung anhand der Sendungsnummer (nur möglich wenn noch nicht manifestiert)",
            parameters: {
                type: "object",
                properties: {
                    shipment_number: {
                        type: "string",
                        description: "Die DHL Sendungsnummer zum Stornieren"
                    }
                },
                required: ["shipment_number"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "list_user_shipments",
            description: "Zeige die letzten Sendungen des Benutzers an",
            parameters: {
                type: "object",
                properties: {
                    limit: {
                        type: "number",
                        description: "Anzahl der anzuzeigenden Sendungen (Standard: 10)"
                    }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "save_user_credentials",
            description: "Speichere die DHL-Zugangsdaten eines Benutzers für die Initialisierung",
            parameters: {
                type: "object",
                properties: {
                    dhl_username: {
                        type: "string",
                        description: "DHL Benutzername"
                    },
                    dhl_password: {
                        type: "string",
                        description: "DHL Passwort"
                    },
                    dhl_billing_number: {
                        type: "string",
                        description: "DHL Abrechnungsnummer (Billing Number)"
                    }
                },
                required: ["dhl_username", "dhl_password", "dhl_billing_number"]
            }
        }
    }
];

module.exports = tools; 