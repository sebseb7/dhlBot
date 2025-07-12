const axios = require('axios');

class AddressValidator {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    async validateAddress(address) {
        try {
            const response = await axios.post(
                `https://addressvalidation.googleapis.com/v1:validateAddress?key=${this.apiKey}`,
                {
                    address: {
                        addressLines: address.split('\n').filter(line => line.trim() !== '')
                    }
                }
            );

            const result = response.data.result;
            
            if (result && result.verdict) {
                const verdict = result.verdict;
                // An address is valid if it's complete and has reasonable geocoding granularity
                // We don't reject addresses just because they have unconfirmed components,
                // as Google often marks corrected addresses as "unconfirmed"
                const isValid = verdict.addressComplete && 
                               (verdict.geocodeGranularity === 'PREMISE' || 
                                verdict.geocodeGranularity === 'SUB_PREMISE' ||
                                verdict.geocodeGranularity === 'RANGE_INTERPOLATED' ||
                                verdict.geocodeGranularity === 'GEOMETRIC_CENTER');
                
                console.log('=== DEBUG: Address Validation Success ===');
                console.log('Original Address:', address);
                console.log('Formatted Address:', result.address?.formattedAddress);
                console.log('Is Valid:', isValid);
                console.log('Address Complete:', verdict.addressComplete);
                console.log('Has Unconfirmed Components:', verdict.hasUnconfirmedComponents);
                console.log('Geocode Granularity:', verdict.geocodeGranularity);
                console.log('Full Verdict:', JSON.stringify(verdict, null, 2));
                console.log('========================================');
                
                return {
                    isValid: isValid,
                    confidence: verdict.geocodeGranularity || 'UNKNOWN',
                    formattedAddress: result.address?.formattedAddress || address,
                    components: result.address?.addressComponents || [],
                    verdict: verdict
                };
            }
            
            console.log('=== DEBUG: Address Validation Result ===');
            console.log('Original Address:', address);
            console.log('API Response:', JSON.stringify(response.data, null, 2));
            console.log('Verdict Missing or Invalid');
            console.log('=======================================');
            
            return {
                isValid: false,
                confidence: 'UNKNOWN',
                formattedAddress: address,
                components: [],
                verdict: null
            };
        } catch (error) {
            console.error('=== DEBUG: Address Validation Error ===');
            console.error('Original Address:', address);
            console.error('Error Status:', error.response?.status);
            console.error('Error Data:', JSON.stringify(error.response?.data, null, 2));
            console.error('Error Message:', error.message);
            console.error('=====================================');
            
            // Return as invalid if validation fails (no false positives)
            return {
                isValid: false,
                confidence: 'VALIDATION_FAILED',
                formattedAddress: address,
                components: [],
                verdict: null,
                error: error.response?.data?.error?.message || error.message
            };
        }
    }
}

module.exports = AddressValidator; 